/**
 * Resolves AWS region from runtime environment with a safe local fallback.
 *
 * @returns AWS region used by SDK clients.
 */
export function getAwsRegion(): string {
  return process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'ca-central-1';
}
