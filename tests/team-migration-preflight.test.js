import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('backup-only migration preflight rejects drift and preserves partial/complete checkpoints',()=>{
 const result=spawnSync('python3',['scripts/team_migration_preflight_test.py'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr||result.error?.message);
});
