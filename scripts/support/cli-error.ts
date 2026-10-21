export function formatCliError(error: unknown): string {
  const name = error instanceof Error ? error.name : 'Error';
  const message = error instanceof Error ? error.message : String(error);

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    return `${name} [${(error as { code: string }).code}]: ${message}`;
  }

  return `${name}: ${message}`;
}
