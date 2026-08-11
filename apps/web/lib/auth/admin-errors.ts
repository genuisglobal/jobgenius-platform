type AuthAdminError = {
  status?: number;
  code?: string;
  message?: string;
};

export function isMissingAuthUserError(error: AuthAdminError | null | undefined) {
  if (!error) return false;

  return (
    error.status === 404 ||
    error.code === "user_not_found" ||
    error.message?.toLowerCase().includes("user not found") === true
  );
}
