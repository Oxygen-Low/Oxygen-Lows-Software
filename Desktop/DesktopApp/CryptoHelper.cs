using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace DesktopApp;

public static class CryptoHelper
{
    private const int Iterations = 100000;
    private const int SaltLength = 16;
    private const int IvLength = 12;

    public static string Decrypt(string base64Text, string masterKey)
    {
        if (string.IsNullOrEmpty(base64Text)) return string.Empty;
        if (string.IsNullOrEmpty(masterKey)) return base64Text;

        try
        {
            byte[] combined = Convert.FromBase64String(base64Text);
            if (combined.Length < SaltLength + IvLength + 16) // Salt + IV + at least 16 bytes tag/ciphertext
            {
                return base64Text; // Fallback or incorrect format
            }

            byte[] salt = new byte[SaltLength];
            byte[] iv = new byte[IvLength];
            byte[] ciphertext = new byte[combined.Length - SaltLength - IvLength];

            Buffer.BlockCopy(combined, 0, salt, 0, SaltLength);
            Buffer.BlockCopy(combined, SaltLength, iv, 0, IvLength);
            Buffer.BlockCopy(combined, SaltLength + IvLength, ciphertext, 0, ciphertext.Length);

            using var pbkdf2 = new Rfc2898DeriveBytes(masterKey, salt, Iterations, HashAlgorithmName.SHA256);
            byte[] key = pbkdf2.GetBytes(32); // 256 bits

            using var aes = new AesGcm(key, tagSizeInBytes: 16);

            int tagLength = 16;
            if (ciphertext.Length < tagLength)
            {
                return base64Text;
            }

            byte[] actualCiphertext = new byte[ciphertext.Length - tagLength];
            byte[] tag = new byte[tagLength];
            Buffer.BlockCopy(ciphertext, 0, actualCiphertext, 0, actualCiphertext.Length);
            Buffer.BlockCopy(ciphertext, actualCiphertext.Length, tag, 0, tagLength);

            byte[] decrypted = new byte[actualCiphertext.Length];
            aes.Decrypt(iv, actualCiphertext, tag, decrypted);

            return Encoding.UTF8.GetString(decrypted);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[CryptoHelper] Decryption failed: {ex.Message}");
            return "[Encrypted - Decryption Failed]";
        }
    }

    public static string Encrypt(string text, string masterKey)
    {
        if (string.IsNullOrEmpty(text)) return string.Empty;
        if (string.IsNullOrEmpty(masterKey)) return text;

        try
        {
            byte[] data = Encoding.UTF8.GetBytes(text);
            byte[] salt = RandomNumberGenerator.GetBytes(SaltLength);
            byte[] iv = RandomNumberGenerator.GetBytes(IvLength);

            using var pbkdf2 = new Rfc2898DeriveBytes(masterKey, salt, Iterations, HashAlgorithmName.SHA256);
            byte[] key = pbkdf2.GetBytes(32); // 256-bit key

            using var aes = new AesGcm(key, tagSizeInBytes: 16);
            byte[] ciphertext = new byte[data.Length];
            byte[] tag = new byte[16];

            aes.Encrypt(iv, data, ciphertext, tag);

            // Combine salt + iv + ciphertext + tag
            byte[] combined = new byte[salt.Length + iv.Length + ciphertext.Length + tag.Length];
            Buffer.BlockCopy(salt, 0, combined, 0, salt.Length);
            Buffer.BlockCopy(iv, 0, combined, salt.Length, iv.Length);
            Buffer.BlockCopy(ciphertext, 0, combined, salt.Length + iv.Length, ciphertext.Length);
            Buffer.BlockCopy(tag, 0, combined, salt.Length + iv.Length + ciphertext.Length, tag.Length);

            return Convert.ToBase64String(combined);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[CryptoHelper] Encryption failed: {ex.Message}");
            return text;
        }
    }
}
