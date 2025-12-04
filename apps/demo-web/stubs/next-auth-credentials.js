export default function CredentialsProvider(config = {}) {
  return { ...config, id: config.id ?? 'credentials' };
}
