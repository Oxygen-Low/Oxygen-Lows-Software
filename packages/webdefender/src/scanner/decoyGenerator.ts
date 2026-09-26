import { SensitivePathCategory } from "./sensitivePaths.js";

export interface DecoyResult {
  content: string;
  contentType: string;
}

function resolvePayload(encoded: string): string {
  const raw = encoded.split("").reverse().join("");
  if (typeof Buffer !== "undefined") {
    return Buffer.from(raw, "base64").toString("utf-8");
  }
  if (typeof atob !== "undefined") {
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder().decode(bytes);
    }
    return binary;
  }
  return "";
}

const PAYLOAD_REGISTRY: Record<string, string> = {
  "dotenv": "=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",
  "aws": "==gCy0CdzV2dtMXdg0DIu9WanVmcKMkY5Eke3g1dxwkY25GOvNUezg2a0VFNwplM5YkQ3x2QidEdNdTR4oGI9ASelt2XzNXZjNWYfRXZyNWZz91c3FmCSBlMOdzSFFDSElzQRhjQ0EUSLFEI9ACZp9Velt2XzNXZjNWYfN3dhpQXu9Wa0NWdk9mcwtlCKETL0NXYl1yc1BSPg42bpdWZypQMZV3MFdWOBhmNKZGOENHMMNWMCZHNUdnMSlXOLpXUtdzKQh3MOhjdg0DI5V2afN3clN2Yh9FdlJ3YlN3XzdXYKgVUQRTTMFzS5YFOa50NZJTQJtUQg0DIkl2X5V2afN3clN2Yh91c3FmCdRHb1FmZlR2W",
  "ssh": "==gCt0SLt0SWFtEIFRVQWlkUQBCSTNlTFB1TgQkTF1SLt0SLKEzdwYXO1hDd3MnNyVTc0A3MvJjbx0GMslza4o2NpZDa1cGNmNTZyQWMjBjY5EGOadTW2gVNXRjVzUlMUFzUwIVORhDUKczT24UNNRDTzskMKFTSwgUOHhjR3UkNEVzQ0I0MBJjexkHM4lzd4Y3N1ZDd1MHNyNTcyAXMvBjb50GOsdza2oWNpRDaKMzZyYWMlBDZ5MGOidTY2oVNZRDWzclMWFTVwQVOThjU3ElNQVzT040MNJDTxsEMKlTS4g0NHZjR1UENENzQyIUMBBjeKkTe4g3N3Zjd1UHN0NzcyIXMxBDc58GOudTb2wWNrRjazkmMoFzZwYWOlhDZ3MmNiVTY0o1MZJDWxcFMWlTV4Q1NTZjUKUTU0A1MPJjTx0EMMlzS4o0NJZDS1cENGNTRyQUMDBjQ5EEO6dTe2gXN3RjdzUnM0FzcwIXOxhDc34mNtVza0k1MoJjTKIWM6FFMMZHW50GNrJjZzskd4A1ZBVUQBFUUtpVcONTYzJVbaFnTzE2cS1mWxRnMjNnUtpVcONTYzJVbaFHdyM2cS1mWKEHdyM2ca1WYy5ESaNnUtFWb0dkY6JVbhNnWHplcsp3YrhXbaFnTzE2cS1mWxJlMjJHetplcOhkWzBXbaJnTIJWbwJTYKoHeHpVbwJTY6hXbaFHdyM2cS1mWxRnMjNnWtFmcOhkWzhmaaFnTIp1c01mWx5ESaNHdtpVcSJzYyB3Ra1mSYplMaJzYKIHbudlaGVVUCZUVRRkSVFlQGVVUCx2MZNnUXJmQGVVUCZEMk5Gasd1cwBTTqhWbUpXTHNWMjx2VCVzaRJkRVFlQGtWWKgmRXl1MCFUQBFUTBFUQBJUQBFUQBFUQBFUQUpVd50mYFFUQBFUVtJmd1ckQBFUQBFURqRGdrhlWyFzQhpnTuJGbCNjYK0SLt0SLZV0SgUEVBZVSSBFIIN1UOVEUPBiTJdURC1SLt0SL",
  "gitConfig": "=ogbpFWbvMHZhVGavMnZlJHI9ASZnJXZtlgCul2ZpJ3bg0DIlR3btVmcJoQXi4Wah1mIgg2YuFmcitlCq8ibpdWay92LzVGdv1WZy9ycmVmc6oyLzRWYlh2LzZWZytCI9ACajRXZmlgC0l2ZukGch1CZuV2ajFmYtUmcvN2LsFmbyVGdulWLzV2YpZnclNXLlJXd0NWdyR3chJnZulmOt92YuIWdoRXanBEdpdGI9ACbyVXCK0lIul2ZpJ3biASZ09WblJ3WKUWdyRHI9ASZzF2YlJ3budWaJoQZ1JHdg0DIzVGdhRGc1ZWZyxGbhd2bslgClNHbhZGI9ASZyFmYJoQZ1JHdg0DIlR2btVGbpZWCKADI9Aibvl2cyVmd0FWby9mZ5J3b0l2cvBXZylgCdVmcvN2W",
  "gitHead": "K4Wah12LzRWYlh2LzZWZyBiOmVmc",
  "wpConfig": "==gC7cCcoBnLzdmbpRHdlNXLwd3Jg4CIIRVQQNlQBBSZj52bfVmcpVXclJnC9pwOpAyJvcCIuAyXfJVSE91XgwyJIRVQQNlQBdCIoUmbpZWZkBCIgAiC7BSKgkCIngEVBB1UCF0JggCZl5WamVGZgECIoAiZppwOpASZzxWYmBCLncUVCVERfB1VnACKl5WamVGZKszJfB3dnASPggXamVmcw9VZsJWY0RiCKsTKgcSa3g0Z1YUZzQ0YxIUY5oVe3g1d1YVdzQ1cxIVc5AFb4cldVFzNrl1c4YjTqhzNtl0N5gGOhhUN2gDN58WM2U3JgACIgACIgACLnkVRL9VRD50TOdCIoUmbpZWZkpwOpAyJphDSnZjRlRDRjJjQhBjW5hDW3ZjV1RDVzJjUxBDUtlDW3ZlM2wmW0dzNPtGO44mS2ATa4IWS2czNzgDcwcjdnACIgACLnkVRL9lTJ9FRFd0RPx0JggSZulmZlRmC7kCInkWOId2NGVWNEN2MCFWMalXOYd3NWVXNUN3MSFXMQ5GMZh3VzcTbBVHO4AFb2kzbLdTMqhzYKdDO2IzNxlDO3dCIgwyJZV0SfhEVVF0XFJVVDV0UnACKl5WamVGZKsTKgcSawg0Z4YUZ2Q0Y0IUYyoVewg1d4YVd2Q1c0IVcyA1bxoVeYRzNuJkd4kTUtZDMwx0NysGOktEO5YTM3oHO5g3JgACIgACIgACIscSWFt0XIRVVBdCIoUmbpZWZkpgC7kCIncCIscSRUFETM90QfJERnACKl5WamVGZKsTKgcCNi1GOmRXdnACLnQVRTJVQIN0XCR0JggSZulmZlRmC7kCInYDMzMjOyEjL0EjLw4CMxcCIscCVT9ESfJERnACKl5WamVGZKsTKgcSIxI0c3wkd0EVbysEe5MiT4A1Xwd1JgwyJEJ1TXN1UBB1XCR0JggSZulmZlRmC7kCInIXZzV3XiR2Xwd3JgwyJSV0UV9lQEdCIoUmbpZWZkpwOpAyJu9Wa0NWdk9mcw9lYk9Fc3dCIscSRNFkTfJERnACKl5WamVGZKAHaw9DP",
  "phpInfo": "=ogPs1Gdo9CPK4Tek9mYvwjC+UGbiFGdvwDIgogPyR3L84DZ09CPp5WauAHaw9SbwZ2Ly4COvAHaw9yY0V2L+IyO4BnN6cmbpRGZhBnI9UGb5R3cgQGd84Da09CPlxWaGBibvlGdhJXdnlmZu92QgQWZkF2bM5jI7QnZlxmOudWasFWL0hXZ0ByO4BnN6cmbpRGZhBnI9UGb5R3cggGd84jc0xDIgACIK4jc09CP+QGdvwTSHNEdzFmRv0EUG5jI7gHc2ozZulGZkFGci0TZslHdzBCZ0xjPoR3L8kEUBBiclZnclNlPisDdmVGb642ZpxWYtQHelRHI7gHc2ozZulGZkFGci0TZslHdzBCa0xjPisjZlR2I6Qmb19mcnt2YhJmI9UGb5R3cgIHd8ACIgAiC+IHdvwjPkR3L8ATM6IjM6QTMgMjMwIDIxIDIjVGR+IyO4BnN6cmbpRGZhBnI9UGb5R3cgQGd84Da09CPlRXYEBCZslWdC5jI7QnZlxmOudWasFWL0hXZ0ByO4BnN6cmbpRGZhBnI9UGb5R3cggGd84jc0xDIgACIK4jc09CP+QGdvwDN28lN4gHIjlmcl5WZn1CO40CMuUTMuUDIxATL2J3ctQ2byBHI4VnbpxkPisDewZjOn5WakRWYwJSPlxWe0NHIkRHP+gGdvwTblR3c5NlPisDdmVGb642ZpxWYtQHelRHI7gHc2ozZulGZkFGci0TZslHdzBCa0xjPisjZlR2I6Qmb19mcnt2YhJmI9UGb5R3cgIHd8ACIgAiC+IyO4B3MxoTZ6l2ctQnbvZGI7gHcwADO6gGdkl2dtgXYtByOlADMxoDa0RWa3ByOlNHchxGbvNmOlNHchxGbvNWLyVGZy9mYi0TZslHdzBSZsJWY0xDIgogPxg2L8QTMuIjL4Aibvl2cyVmVgAFSQ5jI7gHc0oTbvRHdvJWLn5WakRWYwByOjN2YjACZpx2bzBCewFjOt9Gd09mYtIXZkJ3biByOtVWNuEjOlpXaz1Cdu9mZi0TZslHdzBSMoxDIgogPisTblFjOul2ZyFWbgsjZpJXZz1ycuF2c6kHbp1WYm1Cdu9mZgsjMyIzI6I3bs92YgsjZmZ2I6Qmb19mcnt2YhJmI9UGb5R3cgkHZvJGPK4DZhVGavwjPlxGdpR3L8kCKvZmbpBHawBSLgQTMuIjL4ACUIBlPlxGdpRHP+QWYlhGPK4jIuVmI9cmbhxGIs1GdoxjC+wWb0hGIFBVWUN0TEFCP",
  "htpasswd": "=ogLstmaph2ZmVGZjJWYwkDO3YTN0MjMxQyc2Q3N1hjd5QSMyBXYkoTevxGclRmCuYXV0NlcRB3Tu1EbLpWSodkZFR2QiFEJ3Vje2k3N4hDJxIHchRiO092bypgLhpFM5FDWyc3MWRTd1QlNzdjU4EHUk8mMtFza54GNkEjcwFGJ64WatRWY",
  "yaml": "=owc5F2dsFGI6QnchR3clJHIgACIKICMwAzM6ADMwMjIg0CIgACIgAiC6MHdy9GcgACIgogZ4UWOkBzYxImMhNjZ0UWNkZzY3IGOhlzXlZXas91YlNXPUVkUDV0UflEUBBSLgACIgACIKAzL5czM2oDdl5mLsFmbyVGdulmLxATLyVGdzVHbj1SZoNWYjB0a3oVbzwkd5E1cxAFe04EOypDdsVXYmVGZv8iOzNXakVmc9wkUV91UJRURSBSLgACIgACIK42bpR3Y1R2byB3XlJ3bj9iMzQTN6QXZu5Cbh5mclRnbp5iclR3c1x2YtEmcvJXdh1CZvJHctIGZAFjQzdDT2RTUtJzS4lzXOhDc6cncfV2YpZnclN3XwBXYv8iOzVmcnR3cvBXPMJVVfV0UBJUQUFERg0CIgACIgAiC6Qnbl1mbvJXa25WZgACIgoQMuQjLyYnOlNWa2JXZz1SZy92YvQmblt2YhJ2L0VmbuAncvNmL5JHdzl2ZlJXLsFmbyVGdulGI6U2Zh1WagACIgogOwBXYgAiC6MXZjlmdyV2cKcCOuMzJgojbvl2cyVmd",
  "serviceAccount": "=0nCiMHdyV2YvEjdvIDa0VXYv9SbvNmLzlGchVGbn92bn5yd3d3LvozcwRHdoJCI6ICbyV3X0JXZj9VOwUDefJXZklmdvJHcfhGd1FmIgAiCsIiblt2b09SbvNmLzlGchVGbn92bn5iMoRXdh92LvozcwRHdoJCI6ISayV3XuV2avRnIgAiCsICa0VXYvIDa0VXYv9ybv02bj5SZsd2bvdmLzRnb192YjF2LvozcwRHdoJCI6ISayV3XoRXdhJCIgoALiQzMygTM5QzMycTM4kDN3MjM4kDMxICI6ICZp9FduVWasNmIgAiCsISbvNmL05WdvN2YhV2YpZnclN3Zu0WYp5SM0kTOtUmc1R3Y1JHdzFmcm5WatQWdvx2YtAncvNGQy92czV2YjFWLldWYy9GdzJCI6ICbpFWbl9FduVWasNmIgAiCsIibc1SLt0SLZV0SgUEVBZVSSBFIE5URt0SLt0ibcJUY1oVezg1dxYVd5Q1c3IVc1A1bz4Ubxw0a5oUa3g0Z1YUZzQ0YxIUY5oVe3g1d1YVdzQ1cxIVc5A1b34Ub1wkbct2MKlWMIdWOGV2NENWNCF2MalXMYdXOWV3NUNXNSF3MQ9WMO1WOMt2NKlWNId2MGVWMENWOCF2NalXNYd3MW5GX1FDVzljUxdDUvVjTtNDTrFjSplDSndjRlVDRjNjQhFjW5lDW3djV1VDVzNjUxFDUvljTtdDTrVjSpNDSnFjRuxVZ5Q0Y3IUY1oVezg1dxYVd5Q1c3IVc1A1bz4Ubxw0a5oUa3g0Z1YUZzQ0YxIUY5oVe3g1d1YVdzQ1cxIVc5A1bux1NO1WNMt2MKlWMIdWOGV2NENWNCF2MalXMYdXOWV3NUNXNSF3MQ9WMO1WOMt2NKlWNId2MGVWMENWOCF2NalXNuxFW3NjV1FDVzljUxdDUvVjTtNDTrFjSplDSndjRlVDRjNjQhFjW5lDW3djV1VDVzNjUxFDUvljTtdDTrVjSpNDSux1ZxYUZ5Q0Y3IUY1oVezg1dxYVd5Q1c3IVc1A1bz4Ubxw0a5oUa3g0Z1YUZzQ0YxIUY5oVe3g1d1YVdzQ1cxIVcuxFNMBnMOZXOLhHONJ3NDFVQCl0bBFURnF0aTd2Z3d2SCN0UBFkRFFVQCBzd5cUarhWcrdmQOFERBJUSnZXRJlUTuxVLt0SLtkVRLBSRUFkVJJFUg4USHVkQt0SLt0iIgojI5V2afVGdhZXayBnIgAiCsISY2YWNlRDZzMmMiFTYwYWOlhDZ3MmNiVTY0Y2MlJDZxMGMilTY4Y2NiAiOiQWaflXZr9VZ0FmdpJHciACIKwiIxQTO50SZyVHdjVnc0NXYyZmbp1CZ19Gbj1Ccy92YiAiOiQWafR3Ylp2byBnIgAiCsICduV3bjNWYfV2YpZnclNnIgojIlBXe0JCIgowe",
  "generic": "=ogMzQTN6QDNuITMuAjLwETPMFkTSVEVOl0XFNVQCFEVBRkCmhTZ3QmNjVjY0E2MmJTZxQGMjljY4E2NfVmdpx2Xr9Gd94URL9EVfN1UFN0QBpQMykTOfR2byB3XjZ3c9QUSfV0QJZlUFNlClZXa0NWY9MVVUFEVTpQZjJXdvNXZSBibvlGdhJXdnlmZu92QgQWZ0NWZ09mcQByI"
};

/**
 * Generates synthetic decoy content and matching Content-Type headers for sensitive path requests.
 */
export function generateDecoyContent(
  rawPath: string,
  category?: SensitivePathCategory,
): DecoyResult {
  const cleaned = (rawPath || "").toLowerCase().split("?")[0].split("#")[0];
  const lastSegment = cleaned.split("/").pop() || "";

  // 1. Dotenv files (.env, .env.local, .env.production, etc.)
  if (
    lastSegment === ".env" ||
    lastSegment.startsWith(".env.") ||
    lastSegment.endsWith(".env") ||
    cleaned.includes("/.env")
  ) {
    return {
      contentType: "text/plain; charset=utf-8",
      content: resolvePayload(PAYLOAD_REGISTRY.dotenv),
    };
  }

  // 2. AWS / Cloud credentials (.aws/credentials, .aws/config, azure/gcloud)
  if (
    cleaned.includes(".aws/credentials") ||
    cleaned.includes("aws-credentials") ||
    cleaned.includes(".aws/config")
  ) {
    return {
      contentType: "text/plain; charset=utf-8",
      content: resolvePayload(PAYLOAD_REGISTRY.aws),
    };
  }

  // 3. SSH / Private Keys & Certificates (id_rsa, private.pem, server.key, etc.)
  if (
    cleaned.includes("id_rsa") ||
    cleaned.includes("id_ed25519") ||
    cleaned.includes("id_ecdsa") ||
    cleaned.includes("id_dsa") ||
    cleaned.endsWith(".key") ||
    cleaned.endsWith(".pem") ||
    cleaned.includes("private")
  ) {
    return {
      contentType: "text/plain; charset=utf-8",
      content: resolvePayload(PAYLOAD_REGISTRY.ssh),
    };
  }

  // 4. Git configuration (.git/config, .git/HEAD)
  if (cleaned.includes("/.git/config") || cleaned === ".git/config") {
    return {
      contentType: "text/plain; charset=utf-8",
      content: resolvePayload(PAYLOAD_REGISTRY.gitConfig),
    };
  }

  if (cleaned.includes("/.git/head") || cleaned === ".git/head") {
    return {
      contentType: "text/plain; charset=utf-8",
      content: resolvePayload(PAYLOAD_REGISTRY.gitHead),
    };
  }

  // 5. WordPress and PHP config files (wp-config.php, config.php, settings.php)
  if (
    cleaned.includes("wp-config") ||
    (cleaned.endsWith(".php") && (cleaned.includes("config") || cleaned.includes("setting")))
  ) {
    return {
      contentType: "application/x-httpd-php; charset=utf-8",
      content: resolvePayload(PAYLOAD_REGISTRY.wpConfig),
    };
  }

  // 6. phpinfo.php / info.php
  if (cleaned.includes("phpinfo") || cleaned.includes("info.php")) {
    return {
      contentType: "text/html; charset=utf-8",
      content: resolvePayload(PAYLOAD_REGISTRY.phpInfo),
    };
  }

  // 7. .htpasswd / auth credentials
  if (cleaned.includes(".htpasswd") || cleaned.includes(".netrc") || cleaned.includes(".pgpass")) {
    return {
      contentType: "text/plain; charset=utf-8",
      content: resolvePayload(PAYLOAD_REGISTRY.htpasswd),
    };
  }

  // 8. Docker compose / Kubernetes / YAML configs
  if (
    cleaned.endsWith(".yaml") ||
    cleaned.endsWith(".yml") ||
    cleaned.includes("docker-compose") ||
    cleaned.includes("k8s")
  ) {
    return {
      contentType: "text/yaml; charset=utf-8",
      content: resolvePayload(PAYLOAD_REGISTRY.yaml),
    };
  }

  // 9. JSON configs & credentials (credentials.json, auth.json, service-account.json, etc.)
  if (
    cleaned.endsWith(".json") ||
    cleaned.includes("credentials") ||
    cleaned.includes("secrets") ||
    cleaned.includes("service-account") ||
    cleaned.includes("api-keys")
  ) {
    return {
      contentType: "application/json; charset=utf-8",
      content: resolvePayload(PAYLOAD_REGISTRY.serviceAccount),
    };
  }

  // 10. Default / Generic fallback
  return {
    contentType: "text/plain; charset=utf-8",
    content: resolvePayload(PAYLOAD_REGISTRY.generic),
  };
}
