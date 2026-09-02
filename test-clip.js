import fs from 'fs';
let content = fs.readFileSync('client/components/apps/PasswordManager.test.tsx', 'utf8');
content = content.replace('vi.clearAllMocks();', 'vi.clearAllMocks();\n    navigator.clipboard.writeText = vi.fn().mockResolvedValue(undefined);');
fs.writeFileSync('client/components/apps/PasswordManager.test.tsx', content);
