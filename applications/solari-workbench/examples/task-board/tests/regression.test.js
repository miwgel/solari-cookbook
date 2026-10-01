import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyPriority} from '../src/bulk.js';
test('bulk priority changes selected A/B and leaves unselected C untouched',()=>{const input=['A','B','C'].map(id=>({id,priority:'normal'}));const result=applyPriority(input,['A','B'],['A','B','C'],'high');assert.equal(result.find(t=>t.id==='A').priority,'high');assert.equal(result.find(t=>t.id==='B').priority,'high');assert.equal(result.find(t=>t.id==='C').priority,'normal');assert.equal(input[0].priority,'normal');});
