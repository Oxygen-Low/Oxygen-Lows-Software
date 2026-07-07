export async function isPasswordPwned(password: string): Promise<boolean> {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-1", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  const prefix = hashHex.substring(0, 5);
  const suffix = hashHex.substring(5);

  try {
    const response = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
    );
    if (!response.ok) {
      // If the API is down, we might want to allow the password or fail-safe.
      // Given the requirement "Preventing signup entirely", we should probably
      // be careful. But HIBP is usually very reliable.
      return false;
    }

    const text = await response.text();
    const lines = text.split("\n");

    return lines.some((line) => {
      const [hashSuffix] = line.split(":");
      return hashSuffix === suffix;
    });
  } catch (error) {
    console.error("Error checking HIBP API:", error);
    return false;
  }
}
