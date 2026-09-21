import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decay, poisson, sigmoid, scoreDistribution, dcCoefficient, properScores } from '../math.ts';

const close = (actual:number,expected:number,tolerance=1e-10) => assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
test('time decay halves weight at the half-life',()=>{close(decay(90,90),0.5);close(decay(180,90),0.25);close(decay(0,90),1);assert.throws(()=>decay(-1,90));assert.throws(()=>decay(1,0));});
test('Poisson handles zero rate and recurrence',()=>{close(poisson(0,0),1);close(poisson(1,0),0);close(poisson(2,2),2*Math.exp(-2));assert.throws(()=>poisson(1,-1));assert.throws(()=>poisson(0.5,1));});
test('stable sigmoid is symmetric and finite for extreme logits',()=>{close(sigmoid(0),0.5);close(sigmoid(2)+sigmoid(-2),1);assert.equal(sigmoid(1000),1);assert.equal(sigmoid(-1000),0);});
test('Dixon-Coles coefficients match all four low-score cases',()=>{assert.equal(dcCoefficient(0,0,2,1),-2);assert.equal(dcCoefficient(0,1,2,1),2);assert.equal(dcCoefficient(1,0,2,1),1);assert.equal(dcCoefficient(1,1,2,1),-1);assert.equal(dcCoefficient(2,1,2,1),0);});
test('Dixon-Coles preserves total mass and both goal expectations',()=>{
  const d=scoreDistribution(1.8,1.1,-0.10);
  close(d.mass,1);close(d.home+d.draw+d.away,1);
  close(d.cells.reduce((s,c)=>s+c.home*c.probability,0),1.8);
  close(d.cells.reduce((s,c)=>s+c.away*c.probability,0),1.1);
  const independent=scoreDistribution(1.8,1.1,0);assert.ok(d.draw>independent.draw);
});
test('score grid bounds keep all probabilities nonnegative at extreme rates',()=>{
  for(const h of [0.15,1,6])for(const a of [0.15,1,6])for(const rho of [-100,0,100]){
    const d=scoreDistribution(h,a,rho);close(d.mass,1);assert.ok(d.cells.every(c=>c.probability>=0));
  }
});
test('score distribution swaps sides symmetrically',()=>{const a=scoreDistribution(1.4,0.8,-.08),b=scoreDistribution(.8,1.4,-.08);close(a.home,b.away);close(a.draw,b.draw);});
test('proper scores use natural log and summed multiclass Brier',()=>{
  const binary=properScores([.75,.25],0);close(binary.logLoss,-Math.log(.75));close(binary.brier,.125);
  const three=properScores([.5,.3,.2],1);close(three.brier,.25+.49+.04);
  assert.throws(()=>properScores([.5,.3],0));assert.throws(()=>properScores([.5,.5],2));
  assert.ok(Number.isFinite(properScores([0,1],0).logLoss));
});
