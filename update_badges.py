import sys

def update_layout():
    path = 'client/components/Layout.tsx'
    with open(path, 'r') as f:
        content = f.read()

    search_text = """          <h1 className={`${styles["logo"]} text-2xl font-bold`}>
            Oxygen Low's Software
          </h1>"""

    replace_text = """          <div className="flex items-center gap-4">
            <h1 className={`${styles["logo"]} text-2xl font-bold`}>
              Oxygen Low's Software
            </h1>
            <a href="https://app.aikido.dev/audit-report/external/9aTbVrarere35IKvzS2R7mBe/request" target="_blank" rel="noopener noreferrer">
              <img src="https://app.aikido.dev/assets/badges/label-only-dark-theme.svg" alt="Aikido Security Audit Report" height="40" />
            </a>
          </div>"""

    if search_text in content:
        new_content = content.replace(search_text, replace_text)
        with open(path, 'w') as f:
            f.write(new_content)
        print(f"Updated {path}")
    else:
        print(f"Could not find search text in {path}")

def update_auth():
    path = 'client/pages/Auth.tsx'
    with open(path, 'r') as f:
        content = f.read()

    search_text = """          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500 mb-2">
            Oxygen Low's Software
          </h1>"""

    replace_text = """          <div className="flex items-center justify-center gap-4 mb-2">
            <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
              Oxygen Low's Software
            </h1>
            <a href="https://app.aikido.dev/audit-report/external/9aTbVrarere35IKvzS2R7mBe/request" target="_blank" rel="noopener noreferrer">
              <img src="https://app.aikido.dev/assets/badges/label-only-dark-theme.svg" alt="Aikido Security Audit Report" height="40" />
            </a>
          </div>"""

    if search_text in content:
        new_content = content.replace(search_text, replace_text)
        with open(path, 'w') as f:
            f.write(new_content)
        print(f"Updated {path}")
    else:
        print(f"Could not find search text in {path}")

if __name__ == "__main__":
    update_layout()
    update_auth()
