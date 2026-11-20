export function demoEnabled(): boolean {
  return process.env.SMEE_ENABLE_DEMO === 'true';
}
