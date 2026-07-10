import sys

def fix_layout():
    path = 'client/components/Layout.tsx'
    with open(path, 'r') as f:
        lines = f.readlines()

    new_lines = []
    skip = False
    for i, line in enumerate(lines):
        if '<div className="w-full px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">' in line:
            new_lines.append(line)
            new_lines.append('          <div className="flex items-center gap-4">\n')
            new_lines.append('            <h1 className={`${styles["logo"]} text-2xl font-bold`}>\n')
            new_lines.append("              Oxygen Low's Software\n")
            new_lines.append('            </h1>\n')
            new_lines.append('            <a href="https://app.aikido.dev/audit-report/external/9aTbVrarere35IKvzS2R7mBe/request" target="_blank" rel="noopener noreferrer">\n')
            new_lines.append('              <img src="https://app.aikido.dev/assets/badges/label-only-dark-theme.svg" alt="Aikido Security Audit Report" height="40" />\n')
            new_lines.append('            </a>\n')
            new_lines.append('          </div>\n')
            skip = True
            continue

        if skip:
            if '<div className="flex items-center gap-4">' in line and 'items-center justify-between' not in line:
                skip = False
                new_lines.append(line)
            continue

        new_lines.append(line)

    with open(path, 'w') as f:
        f.writelines(new_lines)
    print(f"Fixed {path}")

if __name__ == "__main__":
    fix_layout()
