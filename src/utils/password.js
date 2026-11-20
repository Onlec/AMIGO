// We slaan nooit het wachtwoord zelf op in Gun (dat zou leesbaar zijn voor
// iedereen die de ruwe data bekijkt), enkel een hash. De pollId gebruiken we
// als "zout" zodat twee prikkers met toevallig hetzelfde wachtwoord niet
// dezelfde hash krijgen.
export async function hashPassword(pollId, password) {
  const data = new TextEncoder().encode(`${pollId}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
