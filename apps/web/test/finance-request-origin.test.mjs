import assert from 'node:assert/strict';
import {test} from 'node:test';
import {financeMockOrigin} from '../src/mocks/finance-request-origin.ts';
test('MSW accepts browser same-origin referrer only when Origin is absent; cross-origin and missing evidence fail',()=>{
 const request=(headers={},referrer)=>new Request('http://localhost/api/finance/raw/imports',{method:'POST',headers,referrer});
 assert.equal(financeMockOrigin(request()),false);
 assert.equal(financeMockOrigin(request({origin:'http://localhost'})),true);
 assert.equal(financeMockOrigin(request({},'http://localhost/motifin/import')),true);
 assert.equal(financeMockOrigin(request({origin:'http://evil.invalid'},'http://localhost/motifin/import')),false);
 assert.equal(financeMockOrigin(request({},'http://evil.invalid/')),false);
 assert.equal(financeMockOrigin(request({'sec-fetch-site':'cross-site'},'http://localhost/motifin/import')),false);
});
