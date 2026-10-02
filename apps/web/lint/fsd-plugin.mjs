import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const layers = ["app", "pages", "features", "entities", "shared"];
const layerOf = (filename) => path.relative(sourceRoot, filename).split(path.sep)[0];

// A string-only restriction can be bypassed with '@/shared/../app' or
// '../model/../../../app'. Normalize local paths before comparing layers.
export default {
  meta: { name: "fsd" },
  rules: {
    "layer-direction": {
      meta: {
        type: "problem",
        schema: [],
        messages: { reverse: "FSD layer dependency {{from}} → {{to}} is forbidden. Move the responsibility to its owning layer." },
      },
      create(context) {
        const filename = context.filename;
        const from = layerOf(filename);
        const fromIndex = layers.indexOf(from);
        if (fromIndex < 0) return {};
        function check(source) {
          if (!source || typeof source.value !== "string") return;
          const specifier = source.value.split(/[?#]/)[0];
          let target;
          if (specifier.startsWith("@/")) target = path.resolve(sourceRoot, specifier.slice(2));
          else if (specifier.startsWith(".")) target = path.resolve(path.dirname(filename), specifier);
          else if (specifier.startsWith("/src/")) target = path.resolve(sourceRoot, specifier.slice(5));
          else return;
          const to = layerOf(target);
          const toIndex = layers.indexOf(to);
          if (toIndex >= 0 && toIndex < fromIndex) {
            context.report({ node: source, messageId: "reverse", data: { from, to } });
          }
        }
        return {
          ImportDeclaration: (node) => check(node.source),
          ExportNamedDeclaration: (node) => check(node.source),
          ExportAllDeclaration: (node) => check(node.source),
          ImportExpression: (node) => check(node.source),
          TSImportType: (node) => check(node.source ?? node.argument?.literal ?? node.argument),
          TSImportEqualsDeclaration: (node) => check(node.moduleReference?.expression),
          CallExpression(node) {
            if (node.callee.type === "Identifier" && node.callee.name === "require") check(node.arguments[0]);
          },
        };
      },
    },
  },
};
