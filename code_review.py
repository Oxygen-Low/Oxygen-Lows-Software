import os

def get_file_content(path):
    with open(path, 'r') as f:
        return f.read()

print("--- client/pages/Auth.tsx ---")
print(get_file_content('client/pages/Auth.tsx'))
print("\n--- client/pages/Account.tsx ---")
print(get_file_content('client/pages/Account.tsx'))
