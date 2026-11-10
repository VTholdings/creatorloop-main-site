#!/usr/bin/python3
"""Isolated Linux functional regression tests; NOT actual macOS/Chief verification.

Run only this file. Neither production launcher nor kit contents are changed.
Actual /bin/bash executes a temporary launcher copy through a controlling PTY.
The copy translates ONLY fixed macOS platform paths: OWNER_HOME, the fixed Node
constant and its directory chain, and absolute uname/stat/shasum/mktemp/date/tee
paths. /usr/bin/env, env -i, shebang -p, export/unset, all reads, path checks,
Node execution/control flow, and pipelines remain intact. BSD stat and Darwin
uname are emulated using isolated absolute native stubs. The checksum stub
accepts only the dummy fixture kit; this does not reverify the real kit hash.
Bare dirname/id/node in the old copy remain bare and resolve in fictional PATH.

All spawned processes receive explicit fictional env dictionaries, never a copy
of the agent/test-runner environment. Native fake Node has no networking code.
Its records contain only environment KEY NAMES/presence/nonempty booleans,
nonsecret CLI parameters, and booleans describing literal fictional stdin.
Neither stdin token nor any environment value is written to recordings.

BASH_ENV actually executes in old noninteractive Bash. ENV is deliberately
hostile too, but noninteractive Bash does not source ENV; its propagation (old)
and absence (new) are separately checked. The documented env -i ... bash -p
entry protects startup for BOTH versions; it is not falsely treated as an old
startup failure. Fictional loader variables test child-environment removal,
not native loader immunity before the shell starts. No real loader is supplied.
"""

import dataclasses
import errno
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pty
import re
import select
import shutil
import subprocess
import tempfile
import termios
import time
import unittest

EVIDENCE_DIR = Path(__file__).resolve().parent
OLD = EVIDENCE_DIR / 'Run_Owner_Check_v1.command'
NEW = EVIDENCE_DIR / 'Run_Owner_Check_v2.command'
FICTIONAL_STDIN = b'FICTIONAL_SOURCE_TOKEN_NEVER_REAL_012345'
FOUR_KEYS = {'HOME', 'PATH', 'LANG', 'LC_ALL'}
SAFE_PATH = '/usr/bin:/bin:/usr/sbin:/sbin'
ANSWER_PROMPTS = (b'Type yes, or press Return to stop: ', b'Type yes or Return to stop: ')
HIDDEN_PROMPT = b'Existing source token (hidden local input): '

# One native, network-free fixture executable. No interpreters can mutate its
# observed environment. Every copied executable reads its own fixture-only root.
STUB_C = r'''
#define _GNU_SOURCE
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/file.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <limits.h>
extern char **environ;
static const char secret[] = "FICTIONAL_SOURCE_TOKEN_NEVER_REAL_012345";
static void quoted(FILE *f, const char *s, size_t n) {
  fputc('"', f);
  for (size_t i=0;i<n;i++) {
    unsigned char c=s[i];
    if(c=='"'||c=='\\') { fputc('\\',f);fputc(c,f); }
    else if(c<32) fprintf(f,"\\u%04x",c);
    else fputc(c,f);
  }
  fputc('"', f);
}
static int present(const char *key) { return getenv(key)!=NULL; }
static int nonempty(const char *key) { const char *p=getenv(key);return p&&*p; }
static int env_equals(const char *key,const char *expected) { const char *p=getenv(key);return p&&!strcmp(p,expected); }
int main(int argc,char **argv) {
  char executable[PATH_MAX], dir[PATH_MAX], config[PATH_MAX], root[PATH_MAX], log[PATH_MAX];
  /* Bash PATH resolution preserves bare argv[0]; inspect only our own executable. */
  ssize_t exe_len=readlink("/proc/self/exe",executable,sizeof(executable)-1);
  if(exe_len<0)return 90;executable[exe_len]=0;
  snprintf(dir,sizeof(dir),"%s",executable);
  char *slash=strrchr(dir,'/'); if(!slash)return 91; *slash=0;
  snprintf(config,sizeof(config),"%s/.fixture-root",dir);
  FILE *cf=fopen(config,"r");if(!cf)return 92;
  if(!fgets(root,sizeof(root),cf))return 93;fclose(cf);
  root[strcspn(root,"\r\n")]=0;
  snprintf(log,sizeof(log),"%s/records.jsonl",root);
  const char *base=strrchr(executable,'/');base=base?base+1:executable;
  const char *kind=base;
  int node=!strcmp(base,"node");
  if(node) kind=strstr(executable,"/untrusted/")?"node_untrusted":"node_trusted";
  int source=node&&argc==4&&!strcmp(argv[2],"--execute-read-only")&&!strcmp(argv[3],"--token-stdin");
  char input[4096];size_t used=0;
  if(source) {
    ssize_t n;while(used<sizeof(input)&&(n=read(0,input+used,sizeof(input)-used))>0)used+=(size_t)n;
  }
  int token_arg=0;for(int i=0;i<argc;i++)if(strstr(argv[i],secret))token_arg=1;
  int fd=open(log,O_WRONLY|O_APPEND|O_CREAT,0600);if(fd<0)return 94;
  flock(fd,LOCK_EX);FILE *f=fdopen(fd,"a");if(!f)return 95;
  fputs("{\"kind\":",f);quoted(f,kind,strlen(kind));
  fputs(",\"executable\":",f);quoted(f,executable,strlen(executable));
  char dummy_home[PATH_MAX];snprintf(dummy_home,sizeof(dummy_home),"%s/dummy-owner-home",root);
  fprintf(f,",\"home_is_dummy_owner\":%s,\"path_is_safe\":%s,\"lang_is_C\":%s,\"lc_all_is_C\":%s",
    env_equals("HOME",dummy_home)?"true":"false",env_equals("PATH","/usr/bin:/bin:/usr/sbin:/sbin")?"true":"false",
    env_equals("LANG","C")?"true":"false",env_equals("LC_ALL","C")?"true":"false");
  fputs(",\"env_keys\":[",f);
  int first=1;for(char **e=environ;*e;e++) {
    char *eq=strchr(*e,'=');size_t n=eq?(size_t)(eq-*e):strlen(*e);
    if(!first)fputc(',',f);first=0;quoted(f,*e,n);
  }
  fprintf(f,"],\"source_token_present\":%s,\"source_token_nonempty\":%s,\"node_options_present\":%s,\"node_path_present\":%s,\"bash_env_present\":%s,\"env_present\":%s,\"token_in_argv\":%s,\"stdin_read\":%s,\"stdin_nonempty\":%s,\"stdin_is_fictional\":%s,\"argv\":[",
    present("source_token")?"true":"false",nonempty("source_token")?"true":"false",
    present("NODE_OPTIONS")?"true":"false",present("NODE_PATH")?"true":"false",
    present("BASH_ENV")?"true":"false",present("ENV")?"true":"false",
    token_arg?"true":"false",source?"true":"false",used?"true":"false",
    source&&used==sizeof(secret)-1&&!memcmp(input,secret,used)?"true":"false");
  for(int i=0;i<argc;i++) {
    if(i)fputc(',',f);
    const char *a=strstr(argv[i],secret)?"<FICTIONAL_CREDENTIAL_REDACTED>":argv[i];
    quoted(f,a,strlen(a));
  }
  fputs("]}\n",f);fflush(f);flock(fd,LOCK_UN);fclose(f);
  if(node) {
    if(argc==2&&!strcmp(argv[1],"--version")){puts("v22.23.3");return 0;}
    if(argc==3&&!strcmp(argv[2],"--offline-validate")){puts("OFFLINE_FIXTURE_OK");return 0;}
    if(source) {
      puts("{\"fixture\":true,\"readOnly\":true,\"network\":false}");
      char fail[PATH_MAX];snprintf(fail,sizeof(fail),"%s/fail-source",root);
      return access(fail,F_OK)==0?7:0;
    }
    return 96;
  }
  if(!strcmp(base,"uname")){puts("Darwin");return 0;}
  if(!strcmp(base,"stat")) {
    if(argc!=4||strcmp(argv[1],"-f"))return 97;
    struct stat st;if(lstat(argv[3],&st))return 1;
    if(!strcmp(argv[2],"%u:%Lp"))printf("%lu:%o\n",(unsigned long)st.st_uid,st.st_mode&07777);
    else if(!strcmp(argv[2],"%u %Lp"))printf("%lu %o\n",(unsigned long)st.st_uid,st.st_mode&07777);
    else return 98;return 0;
  }
  if(!strcmp(base,"shasum")) {
    if(argc!=5||strcmp(argv[1],"-a")||strcmp(argv[2],"256")||strcmp(argv[3],"-c")||strcmp(argv[4],"SHA256SUMS"))return 99;
    if(access("SHA256SUMS",F_OK)||access("owner-source-token-check.mjs",F_OK))return 1;
    puts("owner-source-token-check.mjs: OK (fictional fixture only)");return 0;
  }
  if(!strcmp(base,"id")){if(argc!=2||strcmp(argv[1],"-u"))return 100;printf("%lu\n",(unsigned long)getuid());return 0;}
  if(!strcmp(base,"dirname")) {
    if(argc!=3||strcmp(argv[1],"--"))return 101;
    char p[PATH_MAX];snprintf(p,sizeof(p),"%s",argv[2]);char *s=strrchr(p,'/');
    if(!s)puts(".");else if(s==p)puts("/");else{*s=0;puts(p);}return 0;
  }
  if(!strcmp(base,"date")){puts("2030-01-02T03:04:05Z");return 0;}
  if(!strcmp(base,"mktemp")) {
    if(argc!=2)return 102;
    char p[PATH_MAX];snprintf(p,sizeof(p),"%s",argv[1]);int out=mkstemp(p);if(out<0)return 1;
    fchmod(out,0600);close(out);puts(p);return 0;
  }
  if(!strcmp(base,"tee")) {
    if(argc!=2)return 103;
    int out=open(argv[1],O_WRONLY|O_TRUNC|O_CREAT,0600);if(out<0)return 1;
    char buf[4096];ssize_t n;while((n=read(0,buf,sizeof(buf)))>0) {
      if(write(1,buf,n)!=n||write(out,buf,n)!=n){close(out);return 1;}
    }
    close(out);char fail[PATH_MAX];snprintf(fail,sizeof(fail),"%s/fail-tee",root);
    return access(fail,F_OK)==0?9:0;
  }
  return 104;
}
'''

@dataclasses.dataclass
class RunResult:
    status: int
    stdout: bytes
    stderr: bytes
    tty_output: bytes
    answer_prompt_seen: bool
    hidden_prompt_seen: bool
    stdin_lines_sent: int


def controlling_tty():
    os.setsid()
    fcntl.ioctl(0, termios.TIOCSCTTY, 0)


class Fixture:
    def __init__(self, owner, version):
        self.owner = owner
        self.version = version
        self.temp = tempfile.TemporaryDirectory(prefix='fictional-launcher-security-')
        owner.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.kit = self.root / 'dummy-kit'
        self.home = self.root / 'dummy-owner-home'
        self.platform = self.root / 'platform'
        self.untrusted = self.root / 'untrusted'
        self.trusted = self.root / 'trusted'
        self.node_dir = self.trusted / 'local' / 'bin'
        self.node = self.node_dir / 'node'
        self.evidence = self.home / '.vt-creatorloop' / 'evidence'
        for d in (self.kit, self.home, self.platform, self.untrusted, self.trusted,
                  self.trusted / 'local', self.node_dir, self.evidence):
            d.mkdir(parents=True, exist_ok=True)
            d.chmod(0o700)
        for directory, names in ((self.platform, ('uname', 'stat', 'shasum', 'mktemp', 'date', 'tee')),
                                 (self.untrusted, ('node', 'dirname', 'id')),
                                 (self.node_dir, ('node',))):
            (directory / '.fixture-root').write_text(str(self.root) + '\n')
            for name in names:
                shutil.copyfile(owner.stub_binary, directory / name)
                (directory / name).chmod(0o700)
        dummy = b'// fictional fixture; never evaluated as JavaScript\n'
        (self.kit / 'owner-source-token-check.mjs').write_bytes(dummy)
        (self.kit / 'SHA256SUMS').write_text(hashlib.sha256(dummy).hexdigest() + '  owner-source-token-check.mjs\n')
        source = (OLD if version == 'old' else NEW).read_text()
        self.original_source = source
        # These are the complete translation allowlist; no logic rewriting.
        self.translations = {}
        for old_path, name in (('/usr/bin/uname', 'uname'), ('/usr/bin/stat', 'stat'),
                               ('/usr/bin/shasum', 'shasum'), ('/usr/bin/mktemp', 'mktemp'),
                               ('/bin/date', 'date'), ('/usr/bin/tee', 'tee')):
            self.translations[old_path] = str(self.platform / name)
        if version == 'new':
            self.translations["readonly OWNER_HOME='/Users/tt1'"] = "readonly OWNER_HOME='" + str(self.home) + "'"
            self.translations["readonly NODE_EXECUTABLE='/usr/local/bin/node'"] = "readonly NODE_EXECUTABLE='" + str(self.node) + "'"
            self.translations['for p in /usr /usr/local /usr/local/bin; do'] = 'for p in ' + ' '.join(map(str, (self.trusted, self.trusted / 'local', self.node_dir))) + '; do'
        for old_literal, replacement in self.translations.items():
            owner.assertIn(old_literal, source, 'Required fixture translation target changed in production')
            source = source.replace(old_literal, replacement)
        self.launcher = self.kit / 'Run_Owner_Check.command'
        self.launcher.write_text(source)
        self.launcher.chmod(0o700)
        # Both startup files are literal fixtures: only a harmless marker write.
        self.bash_env = self.root / 'hostile-BASH_ENV.sh'
        self.env_file = self.root / 'hostile-ENV.sh'
        self.startup_marker = self.root / 'bash-env-triggered'
        self.env_marker = self.root / 'env-triggered'
        self.bash_env.write_text("builtin printf 'FICTIONAL_STARTUP_MARKER\\n' >> '" + str(self.startup_marker) + "'\n")
        self.env_file.write_text("builtin printf 'FICTIONAL_ENV_MARKER\\n' >> '" + str(self.env_marker) + "'\n")

    def env(self, hostile=True):
        # Never os.environ.copy(), dict(os.environ), or ambient shell expansion.
        env = {'HOME': str(self.home), 'PATH': str(self.untrusted), 'LANG': 'C', 'LC_ALL': 'C'}
        if hostile:
            env.update({
                'source_token': 'FICTIONAL_INHERITED_EXPORT_ONLY',
                'NODE_OPTIONS': '--require=/fictional/nonexistent-preload.cjs',
                'NODE_PATH': '/fictional/nonexistent-node-modules',
                'BASH_ENV': str(self.bash_env), 'ENV': str(self.env_file),
                'LD_LIBRARY_PATH': str(self.root / 'fictional-no-libraries'),
                'LD_PRELOAD': str(self.root / 'fictional-no-loader.so'),
                'DYLD_LIBRARY_PATH': str(self.root / 'fictional-no-dyld'),
                'DYLD_INSERT_LIBRARIES': str(self.root / 'fictional-no-dyld-loader'),
                'DYLD_FRAMEWORK_PATH': str(self.root / 'fictional-no-frameworks'),
                'CDPATH': '/fictional/nonexistent-cdpath',
                'GLOBIGNORE': 'FICTIONAL_GLOB', 'HISTFILE': '/fictional/nonexistent-history',
            })
        return env

    def records(self):
        path = self.root / 'records.jsonl'
        if not path.exists():
            return []
        content = path.read_bytes()
        self.owner.assertNotIn(FICTIONAL_STDIN, content, 'Record must never store literal stdin')
        self.owner.assertNotIn(b'FICTIONAL_INHERITED_EXPORT_ONLY', content, 'Record must never store env values')
        result = [json.loads(line) for line in content.splitlines()]
        for record in result:
            self.owner.assertEqual(set(record), {'kind', 'executable', 'env_keys', 'source_token_present',
                'home_is_dummy_owner', 'path_is_safe', 'lang_is_C', 'lc_all_is_C',
                'source_token_nonempty', 'node_options_present', 'node_path_present',
                'bash_env_present', 'env_present', 'token_in_argv', 'stdin_read',
                'stdin_nonempty', 'stdin_is_fictional', 'argv'})
            self.owner.assertTrue(all(isinstance(v, bool) for k, v in record.items()
                if k not in {'kind', 'executable', 'env_keys', 'argv'}))
        return result

    def run(self, entry='shebang', answer=b'yes', token=FICTIONAL_STDIN, env=None):
        child_env = self.env() if env is None else env
        if entry == 'shebang':
            command = [str(self.launcher)]
        elif entry == 'documented':
            command = ['/usr/bin/env', '-i', 'HOME=' + str(self.home),
                       'PATH=' + str(self.untrusted), 'LANG=C', 'LC_ALL=C',
                       '/bin/bash', '--noprofile', '--norc', '-p', str(self.launcher)]
        elif entry == 'non-p':
            command = ['/bin/bash', '--noprofile', '--norc', str(self.launcher)]
        else:
            raise ValueError(entry)
        master, slave = pty.openpty()
        type(self.owner).pty_invocations += 1
        p = subprocess.Popen(command, cwd=self.kit, env=child_env,
                             stdin=slave, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             preexec_fn=controlling_tty, close_fds=True)
        os.close(slave)
        streams = {p.stdout.fileno(): ('stdout', p.stdout), p.stderr.fileno(): ('stderr', p.stderr), master: ('tty', None)}
        data = {'stdout': bytearray(), 'stderr': bytearray(), 'tty': bytearray()}
        answer_seen = hidden_seen = False
        sent = 0
        deadline = time.monotonic() + 10
        try:
            while streams:
                if time.monotonic() > deadline:
                    os.killpg(p.pid, 9)
                    p.wait()
                    self.owner.fail('PTY fixture timed out (no output or credential dumped)')
                ready, _, _ = select.select(list(streams), [], [], 0.05)
                for fd in ready:
                    try:
                        chunk = os.read(fd, 65536)
                    except OSError as e:
                        if e.errno != errno.EIO:
                            raise
                        chunk = b''
                    if not chunk:
                        label, stream = streams.pop(fd)
                        if stream is not None:
                            stream.close()
                        else:
                            os.close(fd)
                        continue
                    data[streams[fd][0]].extend(chunk)
                visible = bytes(data['stdout'] + data['stderr'] + data['tty'])
                if not answer_seen and any(x in visible for x in ANSWER_PROMPTS):
                    answer_seen = True
                    os.write(master, answer + b'\n')
                    sent += 1
                if not hidden_seen and HIDDEN_PROMPT in visible:
                    hidden_seen = True
                    os.write(master, token + b'\n')
                    sent += 1
                if p.poll() is not None and master in streams:
                    # Once all slave references close, Linux PTY master reports EIO.
                    pass
            status = p.wait(timeout=1)
        finally:
            if p.poll() is None:
                os.killpg(p.pid, 9)
                p.wait()
            for fd, (_, stream) in list(streams.items()):
                if stream is not None:
                    stream.close()
                else:
                    os.close(fd)
        return RunResult(status, bytes(data['stdout']), bytes(data['stderr']), bytes(data['tty']), answer_seen, hidden_seen, sent)


class LauncherSecurityRegression(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.geteuid() == 0:
            raise RuntimeError('These production-guard-preserving tests MUST run as a nonroot fixture owner')
        cls.pty_invocations = 0
        cls.compiler_temp = tempfile.TemporaryDirectory(prefix='fictional-launcher-stub-build-')
        cls.addClassCleanup(cls.compiler_temp.cleanup)
        build = Path(cls.compiler_temp.name)
        source = build / 'fixture_stub.c'
        source.write_text(STUB_C)
        cls.stub_binary = build / 'fixture_stub'
        result = subprocess.run(['/usr/bin/gcc', '-std=c11', '-O2', str(source), '-o', str(cls.stub_binary)],
            env={'HOME': str(build / 'dummy-home'), 'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C'},
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        if result.returncode:
            raise RuntimeError('Native fixture compilation failed: ' + result.stderr.decode(errors='replace'))
        cls.original_hashes = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in (OLD, NEW)}

    @classmethod
    def tearDownClass(cls):
        for path, expected in cls.original_hashes.items():
            actual = hashlib.sha256(path.read_bytes()).hexdigest()
            if actual != expected:
                raise AssertionError('Production launcher changed during tests: ' + str(path))

    def fixture(self, version):
        return Fixture(self, version)

    def node_records(self, fixture):
        return [r for r in fixture.records() if r['kind'].startswith('node_')]

    def assert_successful_source(self, fixture, result):
        self.assertEqual(result.status, 0, 'Fixture launcher unexpectedly failed')
        self.assertTrue(result.answer_prompt_seen)
        self.assertTrue(result.hidden_prompt_seen)
        self.assertEqual(result.stdin_lines_sent, 2)
        nodes = self.node_records(fixture)
        self.assertEqual(len(nodes), 3, 'Must exercise actual Node version, offline, and source calls')
        source = [r for r in nodes if r['stdin_read']]
        self.assertEqual(len(source), 1)
        self.assertTrue(source[0]['stdin_is_fictional'], 'Only literal fictional stdin reaches source Node')
        self.assertTrue(all(not r['token_in_argv'] for r in fixture.records()))
        self.assertEqual(nodes[0]['argv'][1:], ['--version'])
        self.assertEqual(nodes[1]['argv'][-1:], ['--offline-validate'])
        self.assertEqual(source[0]['argv'][-2:], ['--execute-read-only', '--token-stdin'])
        self.assertEqual(len(source[0]['argv']), 4)

    def assert_no_input_or_node(self, fixture, result, message):
        self.assertNotEqual(result.status, 0)
        self.assertIn(message, result.stdout + result.stderr)
        self.assertFalse(result.answer_prompt_seen, 'Rejected path must fail even before availability prompt')
        self.assertFalse(result.hidden_prompt_seen, 'Rejected path must fail before hidden input')
        self.assertEqual(result.stdin_lines_sent, 0)
        self.assertEqual(self.node_records(fixture), [])

    def test_01_static_production_fixed_node_and_clean_exec(self):
        """V2 literals, -p, env -i, preserved trust/control/export protections."""
        source = NEW.read_text()
        self.assertTrue(source.startswith('#!/bin/bash -p\n'))
        self.assertIn("readonly OWNER_HOME='/Users/tt1'", source)
        self.assertIn("readonly NODE_EXECUTABLE='/usr/local/bin/node'", source)
        self.assertIn("readonly SAFE_PATH='/usr/bin:/bin:/usr/sbin:/sbin'", source)
        self.assertIn('/usr/bin/env -i HOME="$OWNER_HOME" PATH="$SAFE_PATH" LANG=C LC_ALL=C "$@"', source)
        self.assertNotRegex(source, r'\bcommand\s+-v\b')
        executable_lines = [line.strip() for line in source.splitlines() if line.strip() and not line.lstrip().startswith('#')]
        self.assertTrue(all(not re.search(r'(?<![\w/.-])node(?=[ \t]|$)', line) for line in executable_lines))
        references = [line for line in executable_lines if '"$NODE_EXECUTABLE"' in line]
        validation_prefix = '[[ -f "$NODE_EXECUTABLE" && -x "$NODE_EXECUTABLE" ]] && secure_node_path "$NODE_EXECUTABLE"'
        validation = [line for line in references if line.startswith(validation_prefix)]
        self.assertEqual(len(validation), 1)
        calls = [line for line in references if line not in validation]
        self.assertEqual(len(calls), 3)
        self.assertTrue(all(line.count('"$NODE_EXECUTABLE"') == line.count('clean_exec "$NODE_EXECUTABLE"') for line in calls))
        self.assertEqual(sum(line.count('"$NODE_EXECUTABLE"') for line in references), 6)
        for child in ('/usr/bin/uname', '/usr/bin/stat', '/usr/bin/shasum', '/usr/bin/mktemp', '/bin/date', '/usr/bin/tee'):
            for line in executable_lines:
                if child in line:
                    self.assertIn('clean_exec ' + child, line)
        self.assertIn('[[ "$-" == *p* ]]', source)
        self.assertIn('[[ "$EUID" -eq 0 ]]', source)
        self.assertIn('[[ ! -L "$p" ]]', source)
        self.assertIn('(( (8#$mode & 0022) == 0 ))', source)
        self.assertIn('for p in /usr /usr/local /usr/local/bin; do', source)
        self.assertIn('pipe_status=("${PIPESTATUS[@]}")', source)
        self.assertIn('builtin unset -v source_token', source)
        self.assertGreaterEqual(source.count('builtin export -n source_token'), 3)
        old = OLD.read_text()
        self.assertIn("source_token=''", old)
        self.assertIn('command -v node', old)
        self.assertIn('| node owner-source-token-check.mjs', old)

    def test_02_inherited_export_old_leaks_all_children_new_absent_exact_four_keys(self):
        """Chief export finding: old empty export persists, then fictional input leaks."""
        for version in ('old', 'new'):
            with self.subTest(version=version):
                f = self.fixture(version)
                result = f.run()
                self.assert_successful_source(f, result)
                records = f.records()
                for kind in ('node_untrusted' if version == 'old' else 'node_trusted', 'tee', 'date', 'mktemp', 'stat', 'shasum', 'uname'):
                    self.assertTrue(any(r['kind'] == kind for r in records), 'Required child not actually exercised: ' + kind)
                if version == 'old':
                    self.assertTrue(all(r['source_token_present'] for r in records), 'Old inherited export must be present in EVERY recorded child')
                    nodes = self.node_records(f)
                    self.assertFalse(nodes[0]['source_token_nonempty'])
                    self.assertFalse(nodes[1]['source_token_nonempty'])
                    self.assertTrue(nodes[2]['source_token_nonempty'])
                    for kind in ('mktemp', 'date', 'tee'):
                        self.assertTrue(all(r['source_token_nonempty'] for r in records if r['kind'] == kind))
                    self.assertTrue({'dirname', 'id'}.issubset({r['kind'] for r in records}))
                else:
                    for r in records:
                        self.assertFalse(r['source_token_present'], r['kind'])
                        self.assertFalse(r['source_token_nonempty'], r['kind'])
                        self.assertEqual(set(r['env_keys']), FOUR_KEYS, r['kind'])
                        for flag in ('home_is_dummy_owner', 'path_is_safe', 'lang_is_C', 'lc_all_is_C'):
                            self.assertTrue(r[flag], r['kind'] + ': ' + flag)
                    self.assertIn('readonly OWNER_HOME=' + repr(str(f.home)), f.launcher.read_text())
                    self.assertIn('HOME="$OWNER_HOME" PATH="$SAFE_PATH" LANG=C LC_ALL=C', f.launcher.read_text())

    def test_03_ambient_path_node_selected_old_never_new(self):
        """Same malicious fictional PATH selects old Node, never fixed V2 Node."""
        for version in ('old', 'new'):
            with self.subTest(version=version):
                f = self.fixture(version)
                result = f.run()
                self.assert_successful_source(f, result)
                expected = 'node_untrusted' if version == 'old' else 'node_trusted'
                self.assertEqual({r['kind'] for r in self.node_records(f)}, {expected})
                for r in self.node_records(f):
                    self.assertEqual(r['executable'], str(f.untrusted / 'node' if version == 'old' else f.node))
                    self.assertEqual(r['argv'][0], 'node' if version == 'old' else str(f.node))

    def test_04_node_options_node_path_and_loader_env_removed_all_new_children(self):
        """Old ambient runtime hooks propagate; V2 removes all keys from children."""
        hostile_keys = {'NODE_OPTIONS', 'NODE_PATH', 'BASH_ENV', 'ENV', 'LD_PRELOAD',
                        'LD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH',
                        'DYLD_FRAMEWORK_PATH', 'CDPATH', 'GLOBIGNORE', 'HISTFILE'}
        for version in ('old', 'new'):
            with self.subTest(version=version):
                f = self.fixture(version)
                result = f.run()
                self.assert_successful_source(f, result)
                records = f.records()
                if version == 'old':
                    self.assertTrue(all(hostile_keys.issubset(set(r['env_keys'])) for r in records))
                    self.assertTrue(all(r['node_options_present'] and r['node_path_present'] for r in records))
                else:
                    self.assertTrue(all(not hostile_keys.intersection(r['env_keys']) for r in records))
                    self.assertTrue(all(not r['node_options_present'] and not r['node_path_present'] and not r['bash_env_present'] and not r['env_present'] for r in records))

    def test_05_hostile_startup_direct_shebang_and_documented_clean_protected_entry(self):
        """Old direct BASH_ENV triggers; new direct and both documented entries don't."""
        for version in ('old', 'new'):
            for entry in ('shebang', 'documented'):
                with self.subTest(version=version, entry=entry):
                    f = self.fixture(version)
                    result = f.run(entry=entry)
                    self.assert_successful_source(f, result)
                    self.assertEqual(f.startup_marker.exists(), version == 'old' and entry == 'shebang')
                    self.assertFalse(f.env_marker.exists(), 'Noninteractive Bash must not be falsely claimed to execute ENV')
                    if version == 'new' or entry == 'documented':
                        self.assertTrue(all(not r['bash_env_present'] and not r['env_present'] for r in f.records()))
                    else:
                        self.assertTrue(all(r['bash_env_present'] and r['env_present'] for r in f.records()))

    def test_06_exported_bash_function_injection_ignored_by_new(self):
        """Old imports hostile Node/printf functions; V2 -p/builtins ignore them."""
        for version in ('old', 'new'):
            with self.subTest(version=version):
                f = self.fixture(version)
                marker_node = f.root / 'imported-node-function-triggered'
                marker_printf = f.root / 'imported-printf-function-triggered'
                env = f.env()
                env['BASH_FUNC_node%%'] = "() { builtin printf 'FICTIONAL_FUNCTION_MARKER\\n' >> '" + str(marker_node) + "'; '" + str(f.untrusted / 'node') + "' \"$@\"; }"
                env['BASH_FUNC_printf%%'] = "() { builtin printf 'FICTIONAL_FUNCTION_MARKER\\n' >> '" + str(marker_printf) + "'; builtin printf \"$@\"; }"
                result = f.run(env=env)
                self.assert_successful_source(f, result)
                self.assertEqual(marker_node.exists(), version == 'old')
                self.assertEqual(marker_printf.exists(), version == 'old')
                if version == 'new':
                    self.assertTrue(all(not any(k.startswith('BASH_FUNC_') for k in r['env_keys']) for r in f.records()))

    def test_07_missing_unsafe_and_symlink_node_rejected_before_any_prompt_input(self):
        """Missing Node, unsafe Node/chain and symlinks have no PATH fallback."""
        for mutation in ('missing-node', 'missing-parent', 'unsafe-node', 'unsafe-directory', 'symlink-node', 'symlink-directory'):
            with self.subTest(mutation=mutation):
                f = self.fixture('new')
                if mutation == 'missing-node':
                    f.node.unlink()
                elif mutation == 'missing-parent':
                    shutil.rmtree(f.node_dir)
                elif mutation == 'unsafe-node':
                    f.node.chmod(0o722)
                elif mutation == 'unsafe-directory':
                    f.node_dir.chmod(0o722)
                elif mutation == 'symlink-node':
                    f.node.unlink()
                    f.node.symlink_to(f.untrusted / 'node')
                elif mutation == 'symlink-directory':
                    real_dir = f.node_dir.with_name('real-bin')
                    f.node_dir.rename(real_dir)
                    f.node_dir.symlink_to(real_dir, target_is_directory=True)
                result = f.run()
                expected = b'TRUSTED_ABSOLUTE_NODE_PATH_REQUIRED' if mutation in ('missing-parent', 'unsafe-directory', 'symlink-directory') else b'TRUSTED_ABSOLUTE_NODE_REQUIRED'
                self.assert_no_input_or_node(f, result, expected)
                self.assertFalse(any(r['kind'] in {'shasum', 'mktemp', 'date', 'tee'} for r in f.records()))

    def test_08_explicit_non_p_bash_invocation_refused(self):
        """V2 refuses non-p before reads; hostile startup is not invoked here."""
        f = self.fixture('new')
        # A non-p shell cannot prevent BASH_ENV executing before script guards.
        # Use only explicit clean fictional env here, never imply otherwise.
        result = f.run(entry='non-p', env=f.env(hostile=False))
        self.assert_no_input_or_node(f, result, b'PROTECTED_SHELL_STARTUP_REQUIRED')
        self.assertEqual(f.records(), [])
        self.assertFalse(f.startup_marker.exists())

    def test_09_blank_availability_or_hidden_token_unavailable_no_source_execution(self):
        """Both versions stop on blank availability or blank hidden token."""
        for version in ('old', 'new'):
            for flow in ('blank-availability', 'blank-token'):
                with self.subTest(version=version, flow=flow):
                    f = self.fixture(version)
                    result = f.run(answer=b'' if flow == 'blank-availability' else b'yes', token=b'')
                    self.assertNotEqual(result.status, 0)
                    self.assertIn(b'SOURCE_TOKEN_UNAVAILABLE', result.stdout + result.stderr)
                    self.assertTrue(result.answer_prompt_seen)
                    self.assertEqual(result.hidden_prompt_seen, flow == 'blank-token')
                    self.assertEqual(result.stdin_lines_sent, 1 if flow == 'blank-availability' else 2)
                    nodes = self.node_records(f)
                    self.assertEqual(len(nodes), 2)
                    self.assertFalse(any(r['stdin_read'] for r in nodes))
                    self.assertFalse(any(r['kind'] in {'mktemp', 'date', 'tee'} for r in f.records()))

    def test_10_pipeline_no_credential_in_stdout_stderr_tty_evidence_and_exit_statuses(self):
        """Token stdin only, sanitized pipeline evidence; Node/tee statuses preserved."""
        for version in ('old', 'new'):
            for failure in ('none', 'source', 'tee'):
                with self.subTest(version=version, failure=failure):
                    f = self.fixture(version)
                    if failure != 'none':
                        (f.root / ('fail-' + failure)).write_text('FICTIONAL_FAILURE_SWITCH\n')
                    result = f.run()
                    self.assertEqual(result.status, {'none': 0, 'source': 7, 'tee': 1}[failure])
                    self.assertTrue(result.hidden_prompt_seen)
                    self.assertEqual(result.stdin_lines_sent, 2)
                    for output in (result.stdout, result.stderr, result.tty_output):
                        self.assertNotIn(FICTIONAL_STDIN, output, 'Fictional token must not appear in output')
                        self.assertNotIn(b'FICTIONAL_INHERITED_EXPORT_ONLY', output, 'Inherited fictional value must not appear in output')
                    source = [r for r in self.node_records(f) if r['stdin_read']]
                    self.assertEqual(len(source), 1)
                    self.assertTrue(source[0]['stdin_is_fictional'])
                    self.assertTrue(all(not r['token_in_argv'] for r in f.records()))
                    files = list(f.evidence.iterdir())
                    self.assertEqual(len(files), 1)
                    evidence = files[0].read_bytes()
                    self.assertNotIn(FICTIONAL_STDIN, evidence)
                    self.assertNotIn(b'FICTIONAL_INHERITED_EXPORT_ONLY', evidence)
                    self.assertEqual(json.loads(evidence), {'fixture': True, 'readOnly': True, 'network': False})
                    self.assertEqual(files[0].stat().st_mode & 0o777, 0o600)
                    if failure == 'tee':
                        self.assertIn(b'SANITIZED_EVIDENCE_SAVE_FAILED', result.stdout)


if __name__ == '__main__':
    print('NEW TEST FILE ONLY — 10 regression methods; old/new actual Bash + PTY', flush=True)
    print('ISOLATION: explicit fictional child env/stdin; native network-free stubs; production launchers read-only', flush=True)
    print('SCOPE: Linux BSD/macOS-path-translated functional fixtures, NOT actual Mac verification or Chief PASS', flush=True)
    print('STARTUP NOTE: old direct BASH_ENV executes; noninteractive ENV does not; documented env -i/bash -p protects both versions', flush=True)
    print('LOADER NOTE: fictional nonexistent loader paths test child env only, not loader execution before shell startup', flush=True)
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(LauncherSecurityRegression)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    print('METHOD_COUNTS: run=%d failures=%d errors=%d skipped=%d' % (result.testsRun, len(result.failures), len(result.errors), len(result.skipped)), flush=True)
    print('ACTUAL_PTY_LAUNCHER_INVOCATIONS: %d' % getattr(LauncherSecurityRegression, 'pty_invocations', 0), flush=True)
    print('No previous verifier or Team tests were imported or run. No kit files were written.', flush=True)
    raise SystemExit(0 if result.wasSuccessful() else 1)
