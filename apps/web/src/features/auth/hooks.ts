import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LoginRequest, SignupRequest } from "@innova/contracts";
import { login, logout, signup } from "@/entities/auth/api";
import { authKeys, currentUserQuery } from "@/entities/auth/queries";

export function useCurrentUser() {
  return useQuery(currentUserQuery());
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginRequest) => login(input),
    onSuccess: (user) => queryClient.setQueryData(authKeys.me, user),
  });
}

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SignupRequest) => signup(input),
    onSuccess: (user) => queryClient.setQueryData(authKeys.me, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(authKeys.me, null);
    },
  });
}
