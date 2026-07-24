import fs from 'fs';
const src = fs.readFileSync('./crm-data.js','utf8');
const store = {};
global.window = global;
global.localStorage = { getItem:k=>store[k]??null, setItem:(k,v)=>{store[k]=v}, removeItem:k=>{delete store[k]} };
global.CustomEvent = class { constructor(n){this.type=n} };
global.dispatchEvent = () => {};
eval(src);
const CRM = global.CRM;
CRM.load();

let fails = 0;
const ok = (name, cond, extra='') => { console.log((cond?'PASS':'FAIL')+' '+name+(extra?'  '+extra:'')); if(!cond) fails++; };

// money math on the seeded example
const m = CRM.affiliateMoney('aff_ex1');
ok('ex1 orders = 6', m.orders===6, `got ${m.orders}`);
ok('ex1 gross = 2173', m.gross===2173, `got ${m.gross}`);
ok('ex1 refunded = 189', m.refunded===189, `got ${m.refunded}`);
ok('ex1 net = 1984', m.net===1984, `got ${m.net}`);
ok('ex1 commission owed is NULL not 0 (no rate set)', m.owed===null, `got ${m.owed}`);
ok('ex1 downline count = 1 (ex2)', m.downlineCount===1, `got ${m.downlineCount}`);

// set a rate and confirm it computes
CRM.update('affiliates','aff_ex1',{rate:20});
const m2 = CRM.affiliateMoney('aff_ex1');
ok('ex1 earned = 20% of net = 396.8', Math.abs(m2.earned-396.8)<0.001, `got ${m2.earned}`);
ok('ex1 owed = earned - paid(0) = 396.8', Math.abs(m2.owed-396.8)<0.001, `got ${m2.owed}`);

// override math: ex2 is a child of ex1, ex2 net = 248
CRM.update('affiliates','aff_ex2',{overrideRate:5});
const m3 = CRM.affiliateMoney('aff_ex1');
ok('ex1 override = 5% of ex2 net 248 = 12.4', Math.abs(m3.overrideEarned-12.4)<0.001, `got ${m3.overrideEarned}`);
ok('ex1 total earned = 396.8 + 12.4', Math.abs(m3.totalEarned-409.2)<0.001, `got ${m3.totalEarned}`);

// payouts reduce owed only when Sent/Cleared
CRM.add('payouts',{date:CRM.today(),affiliateId:'aff_ex1',amount:100,method:'ACH',status:'Queued'});
ok('queued payout does NOT reduce owed', Math.abs(CRM.affiliateMoney('aff_ex1').owed-409.2)<0.001, `got ${CRM.affiliateMoney('aff_ex1').owed}`);
CRM.add('payouts',{date:CRM.today(),affiliateId:'aff_ex1',amount:100,method:'ACH',status:'Cleared'});
ok('cleared payout DOES reduce owed to 309.2', Math.abs(CRM.affiliateMoney('aff_ex1').owed-309.2)<0.001, `got ${CRM.affiliateMoney('aff_ex1').owed}`);

// gates
const g = CRM.gateProgress(CRM.get('affiliates','aff_ex2'));
ok('ex2 gates 3/9 done', g.done===3 && g.total===9, `got ${g.done}/${g.total}`);
ok('ex2 blocked at tax', g.blockedBy && g.blockedBy.id==='tax', `got ${g.blockedBy&&g.blockedBy.id}`);
ok('ex1 gates complete', CRM.gateProgress(CRM.get('affiliates','aff_ex1')).complete===true);

// defects: braden has owner Alex + next action -> not a defect; connor is Unassigned -> defect
const d = CRM.defects().map(x=>x.id);
ok('connor flagged as defect (no owner)', d.includes('aff_connor'), d.join(','));
ok('ex1 not a defect', !d.includes('aff_ex1'));

// overdue
const od = CRM.overdue().map(x=>x.id);
ok('tomas overdue (due -4d)', od.includes('aff_ex4'), od.join(','));
ok('devon overdue (due -1d)', od.includes('aff_ex2'));

// totals
const t = CRM.totals();
ok('total gross = 2421', t.gross===2421, `got ${t.gross}`);
ok('total orders = 7', t.orders===7, `got ${t.orders}`);
ok('activationRate computed', t.activationRate!==null, `got ${t.activationRate}`);

// sorting incl derived columns
const byGross = CRM.list('affiliates',{sort:'gross',dir:'desc'}).map(r=>r.id);
ok('sort by derived gross desc puts ex1 first', byGross[0]==='aff_ex1', byGross.slice(0,3).join(','));
const byName = CRM.list('affiliates',{sort:'name',dir:'asc'}).map(r=>r.name);
ok('sort by name asc works', byName[0] <= byName[1], byName.slice(0,2).join(' | '));

// search + filter
ok('search "devon" finds 1', CRM.list('affiliates',{search:'devon'}).length===1);
ok('filter stage=active finds 2 (connor + ex1)', CRM.list('affiliates',{filters:{stage:'active'}}).length===2,
   String(CRM.list('affiliates',{filters:{stage:'active'}}).length));

// CSV round trip
const csv = CRM.toCSV('affiliates');
ok('CSV has header row with id', csv.split('\n')[0].startsWith('id,'));
ok('CSV includes derived commissionOwed col', csv.split('\n')[0].includes('commissionOwed'));
const before = CRM.all('affiliates').length;
const res = CRM.fromCSV('affiliates', csv);
ok('CSV reimport updates, does not duplicate', CRM.all('affiliates').length===before, `${before} -> ${CRM.all('affiliates').length}, ${JSON.stringify(res)}`);

// import validation rejects missing required
const bad = 'name,owner,stage,nextAction,nextActionDue\n,Alex,sourced,do a thing,2026-08-01\n';
const r2 = CRM.fromCSV('affiliates', bad);
ok('CSV row missing required name is skipped', r2.skipped===1 && r2.added===0, JSON.stringify(r2));

// cascade delete
CRM.remove('affiliates','aff_ex1');
ok('deleting ex1 removes its sales', CRM.all('sales').filter(s=>s.affiliateId==='aff_ex1').length===0);
ok('deleting ex1 orphans ex2 parentId', CRM.get('affiliates','aff_ex2').parentId==='');

console.log(fails===0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails?1:0);
