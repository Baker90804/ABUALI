export const zone = 'Asia/Baghdad';
export const day = (value = Date.now()) => new Intl.DateTimeFormat('en-CA',{timeZone:zone}).format(new Date(value));
export const normalize = (value='') => String(value).normalize('NFKC').toLowerCase().replace(/[٠-٩۰-۹]/g,c=>'٠١٢٣٤٥٦٧٨٩'.includes(c)?'٠١٢٣٤٥٦٧٨٩'.indexOf(c):'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).trim();
export const number = value => {
  const raw=normalize(value).replace(/[,٬\s]/g,'');
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw Error('أدخل مبلغاً أو عدداً صحيحاً');
  return Number(raw);
};
export const statuses={pending:'◷ بانتظار التأكيد',confirmed:'✓ مؤكد',packing:'□ قيد التجهيز',ready:'✓ جاهز',sent:'◇ خرج للتوصيل',delivered:'✓ مستلَم',cancelled:'× ملغي',partial:'↶ راجع جزئياً',returned:'↶ راجع بالكامل',inspection:'◷ فحص',available:'✓ متاحة',reserved:'◷ محجوزة',sold:'✓ مباعة',damaged:'× تالفة',closed:'✓ منتهٍ',open:'◉ مفتوح'};
export const groups=['suppliers','batches','items','streams','holds','customers','orders','returns','money','settlements','counts','audit'];
export const empty = () => ({version:1,settings:{name:'أمازون أبو علي',logo:'',phone:'',address:'',minutes:30},...Object.fromEntries(groups.map(g=>[g,[]]))});
export const roles={owner:'المالك',live:'موظف البث',pack:'موظف التغليف',account:'المحاسب'};
const allowed={live:['stream','editStream','show','hold','release','transfer','customer','combine','end'],pack:['inspect','orderStatus','count'],account:['money','payout','closeCash','supplierPayment']};
const imagePattern=/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const fail = (condition,message) => {if(condition) throw Error(message)};
export function allocate(total, weights) {
  const sum=weights.reduce((a,b)=>a+BigInt(b),0n);
  fail(!sum,'مجموع الأوزان يجب أن يكون أكبر من صفر');
  const shares=weights.map((w,i)=>({i,q:Number(BigInt(total)*BigInt(w)/sum),r:BigInt(total)*BigInt(w)%sum}));
  let rest=total-shares.reduce((a,b)=>a+b.q,0);
  for(const part of [...shares].sort((a,b)=>a.r>b.r?-1:a.r<b.r?1:a.i-b.i)) if(rest>0){part.q++;rest--}
  return shares.map(p=>p.q);
}
export function view(s,role) {
  if(role==='owner'||role==='account') return s;
  const omit=(o,keys)=>Object.fromEntries(Object.entries(o).filter(([k])=>!keys.includes(k)));
  return {...s,suppliers:[],batches:[],money:[],settlements:[],returns:[],audit:[],
    items:s.items.map(i=>omit(i,['cost','repair','min','batch'])),
    orders:s.orders.map(o=>({...omit(o,['fee','collected','paidOut','payment','method']),lines:o.lines.map(l=>omit(l,['cost']))}))};
}
export function validate(s){
  fail(!s||s.version!==1||!s.settings||typeof s.settings.name!=='string'||!Number.isSafeInteger(s.settings.minutes)||s.settings.minutes<1||s.settings.minutes>10080||(s.settings.logo&&!imagePattern.test(s.settings.logo)),'صيغة النسخة أو إصدارها غير مدعوم');
  for(const g of groups){
    fail(!Array.isArray(s[g]),'جدول مفقود: '+g);
    const ids=new Set();
    for(const r of s[g]){fail(!r||typeof r.id!=='string'||ids.has(r.id)||typeof r.at!=='string'||!Number.isFinite(Date.parse(r.at)),'معرّف سجل غير صالح: '+g);ids.add(r.id)}
  }
  for(const i of s.items){
    for(const key of ['cost','repair','price','min']) fail(!Number.isSafeInteger(i[key])||i[key]<0,'قيمة قطعة غير صالحة');
    fail(!Array.isArray(i.photos)||i.photos.some(p=>typeof p!=='string'||!imagePattern.test(p)),'صورة غير صالحة');
  }
  const ids=Object.fromEntries(groups.map(g=>[g,new Set(s[g].map(r=>r.id))]));
  const ar=(r,keys)=>keys.every(key=>Number.isSafeInteger(r[key])&&r[key]>=0);
  const timestamp=t=>typeof t==='string'&&Number.isFinite(Date.parse(t));
  const has=(g,id)=>ids[g].has(id);
  for(const b of s.batches)fail(!has('suppliers',b.supplier)||!ar(b,['purchase','shipping','paid'])||b.paid>b.purchase+b.shipping,'دفعة شراء غير صالحة');
  for(const i of s.items)fail((i.batch&&!has('batches',i.batch))||!['available','inspection','reserved','sold','damaged'].includes(i.status)||typeof i.code!=='string'||typeof i.name!=='string','قطعة غير صالحة');
  for(const b of s.streams)fail(!Array.isArray(b.slots)||b.slots.some((l,j)=>!has('items',l.item)||l.no!==j+1),'أرقام عرض غير صالحة');
  for(const h of s.holds)fail(!has('items',h.item)||!has('streams',h.stream)||!ar(h,['price'])||!timestamp(h.until),'حجز غير صالح');
  for(const o of s.orders)fail((o.customer&&!has('customers',o.customer))||!ar(o,['no','delivery','fee','collected','paidOut'])||o.paidOut>o.collected||(o.deliveredAt&&!timestamp(o.deliveredAt))||!Array.isArray(o.lines)||!o.lines.length||o.lines.some(l=>!has('items',l.item)||(l.stream&&!has('streams',l.stream))||!ar(l,['price','net','cost'])||l.net>l.price),'طلب أو بنوده غير صالحة');
  for(const r of s.returns)fail(!has('orders',r.order)||!has('items',r.item)||!ar(r,['refund','shipping','cost']),'مرتجع غير صالح');
  for(const r of s.settlements)fail(!has('orders',r.order)||!ar(r,['amount','charges','difference']),'تسوية غير صالحة');
  for(const m of s.money)fail(!Number.isSafeInteger(m.amount)||!['cash','transfer'].includes(m.method),'حركة مالية غير صالحة');
  for(const c of s.counts)fail(!has('items',c.item)||!ar(c,['actual','expected']),'جرد غير صالح');
  return s;
}
export function apply(previous,type,p,actor={name:'المالك',role:'owner'},now=new Date().toISOString()){
  fail(actor.role!=='owner'&&!allowed[actor.role]?.includes(type),'الصلاحية غير متاحة لهذا المستخدم');
  const s=structuredClone(previous);
  const row=(g,id)=>{const r=s[g].find(v=>v.id===id);fail(!r,'السجل غير موجود');return r};
  const add=(g,data)=>{const r={...data,id:crypto.randomUUID(),at:now,by:actor.name};s[g].push(r);return r};
  const str=(key,required=false)=>{const v=String(p[key]??'').trim();fail(required&&!v,'أكمل الحقل المطلوب');return v};
  const n=(key)=>number(p[key]??0);
  const item=id=>row('items',id);
  const ledger=(kind,amount,method='cash',ref='',note='')=>{fail(!['cash','transfer'].includes(method),'طريقة الدفع غير صالحة');return add('money',{kind,amount,method,ref,note})};
  const hold=(data)=>add('holds',{...data,until:new Date(Date.parse(now)+s.settings.minutes*60000).toISOString()});
  const order=(ids,lines,cust,ship,delivery,discount,method)=>{
    fail(!lines.length||new Set(ids).size!==ids.length,'اختر قطعاً مختلفة');
    fail(!['shop','delivery'].includes(ship)||!['cash','transfer'].includes(method),'تحقق من التسليم وطريقة الدفع');
    fail(ship==='shop'&&delivery!==0,'أجرة التوصيل تخص الطلبات المرسلة');
    const sum=lines.reduce((a,l)=>a+l.price,0);
    fail(discount>sum,'الخصم أكبر من المجموع');
    const discounts=discount?allocate(discount,lines.map(l=>l.price)):lines.map(()=>0);
    const adjusted=lines.map((l,j)=>({...l,net:l.price-discounts[j],cost:item(l.item).cost+item(l.item).repair,returned:false}));
    fail(adjusted.some(l=>l.net<item(l.item).min),'سعر بند أقل من الحد الأدنى');
    const o=add('orders',{no:s.orders.length+1,customer:cust,ship,delivery,lines:adjusted,status:'pending',method,payment:'unpaid',carrier:'',tracking:'',fee:0,collected:0,paidOut:0});
    for(const id of ids)item(id).status='sold';
    return o;
  };
  const deliver=o=>{
    o.status='delivered';o.deliveredAt=now;
    const due=o.lines.reduce((a,l)=>a+l.net,0)+o.delivery;
    o.collected=o.ship==='delivery'?n('collected'):due;
    fail(o.collected>due,'التحصيل أكبر من المبلغ المطلوب');
    o.payment=o.collected===due?'paid':o.collected?'partial':'unpaid';
    if(o.ship!=='delivery')ledger('sale',o.collected,o.method,o.id);
  };
  switch(type){
  case 'settings': {const minutes=n('minutes');fail(!minutes||minutes>10080,'أدخل مهلة بين دقيقة وسبعة أيام');s.settings={name:str('name',true),phone:str('phone'),address:str('address'),logo:str('logo')||s.settings.logo,minutes};break}
  case 'supplier': add('suppliers',{name:str('name',true),phone:str('phone'),note:str('note')});break;
  case 'batch':{
    row('suppliers',p.supplier);const purchase=n('purchase'),shipping=n('shipping'),paid=n('paid');
    fail(paid>purchase+shipping,'المدفوع أكبر من إجمالي الدفعة');
    const b=add('batches',{name:str('name',true),supplier:p.supplier,date:str('date',true),purchase,shipping,paid});
    if(paid)ledger('supplier',-paid,p.method,b.id);break
  }
  case 'supplierPayment':{const b=row('batches',p.id);const amount=n('amount');fail(!amount||b.paid+amount>b.purchase+b.shipping,'الدفعة تتجاوز الرصيد');b.paid+=amount;ledger('supplier',-amount,p.method,b.id,str('note',true));break}
  case 'item':{
    const quantity=n('quantity')||1;fail(quantity>200,'الحد ٢٠٠ قطعة للعملية');
    const code=str('code',true),price=n('price'),min=n('min');fail(min>price,'أدنى سعر أكبر من سعر العرض');
    if(p.batch)row('batches',p.batch);
    if(p.id){const i=item(p.id);fail(['reserved','sold'].includes(i.status)&&(i.min!==min||i.cost!==n('cost')||i.repair!==n('repair')),'راجع حالة القطعة قبل تعديل تكلفتها أو الحد الأدنى');if(i.price!==price||i.cost!==n('cost')||i.repair!==n('repair')||i.min!==min)str('note',true);
      fail(s.items.some(x=>x.id!==i.id&&normalize(x.code)===normalize(code)),'الكود مستخدم');
      Object.assign(i,{code,price,min,name:str('name',true),barcode:str('barcode'),category:str('category'),location:str('location'),missing:str('missing'),defect:str('defect'),cost:n('cost'),repair:n('repair'),photos:p.photos?.length?p.photos:i.photos});break}
    for(let j=0;j<quantity;j++){
      const unit=quantity===1?code:code+'-'+(j+1);
      fail(s.items.some(x=>normalize(x.code)===normalize(unit)),'الكود مستخدم: '+unit);
      add('items',{code:unit,barcode:str('barcode'),name:str('name',true),category:str('category'),location:str('location'),missing:str('missing'),defect:str('defect'),batch:p.batch||'',price,min,cost:n('cost'),repair:n('repair'),photos:p.photos||[],status:'inspection'});
    }break
  }
  case 'allocate':{
    const b=row('batches',p.id),items=s.items.filter(i=>i.batch===b.id),total=b.purchase+b.shipping;
    str('note',true);fail(!['equal','weighted','manual'].includes(p.mode),'طريقة توزيع غير صالحة');
    fail(!items.length||items.some(i=>['reserved','sold'].includes(i.status)||s.orders.some(o=>o.lines.some(l=>l.item===i.id))),'التوزيع متاح لدفعة فيها قطع وقبل تسجيل الحجوزات أو المبيعات');
    const weights=p.mode==='equal'?items.map(()=>1):String(p.values).split(/[\s،]+/).filter(Boolean).map(number);
    fail(weights.length!==items.length,'أدخل قيمة لكل قطعة حسب ترتيبها');
    const costs=p.mode==='manual'?weights:allocate(total,weights);
    fail(costs.reduce((a,c)=>a+c,0)!==total,'مجموع التوزيع لا يطابق تكلفة الدفعة');
    items.forEach((i,j)=>i.cost=costs[j]);break
  }
  case 'inspect':{const i=item(p.id);fail(i.status!=='inspection'||!['available','damaged'].includes(p.status),'القطعة غير متاحة للفحص');i.status=p.status;i.defect=str('defect')||i.defect;break}
  case 'count':{
    const i=item(p.id),actual=n('actual'),expected=i.status==='damaged'?0:1;
    fail(actual>1||i.status==='sold','اختر قطعة موجودة في عهدة المحل');
    const note=str('note',actual!==expected);
    if(p.adjust&&actual!==expected){fail(i.status==='reserved','حل الحجز قبل التسوية');i.status=actual?'inspection':'damaged'}
    add('counts',{item:i.id,actual,expected,note,adjusted:Boolean(p.adjust&&actual!==expected)});break
  }
  case 'stream':{
    const ids=p.items||[];fail(!ids.length||new Set(ids).size!==ids.length,'اختر قطعاً مختلفة');
    for(const id of ids)fail(item(id).status!=='available','توجد قطعة غير متاحة');
    add('streams',{name:str('name',true),date:str('date',true),status:'open',slots:ids.map((id,j)=>({item:id,no:j+1,shown:false}))});break
  }
  case 'editStream':{
    const b=row('streams',p.id),ids=p.items||[];
    fail(b.status!=='open'||b.slots.some(x=>x.shown)||s.holds.some(h=>h.stream===b.id),'لا يمكن تغيير ترتيب جلسة بدأ عرضها');
    fail(!ids.length||new Set(ids).size!==ids.length,'اختر قطعاً مختلفة');
    for(const id of ids)fail(item(id).status!=='available','توجد قطعة غير متاحة');
    b.name=str('name',true);b.date=str('date',true);b.slots=ids.map((id,j)=>({item:id,no:j+1,shown:false}));break
  }
  case 'show':{const b=row('streams',p.stream);const slot=b.slots.find(x=>x.no===n('no'));fail(!slot||b.status!=='open','رقم العرض أو الجلسة غير متاح');slot.shown=true;break}
  case 'end':row('streams',p.id).status='closed';break;
  case 'hold':{
    const b=row('streams',p.stream),slot=b.slots.find(x=>x.no===n('no'));fail(!slot,'رقم العرض غير موجود');
    const i=item(slot.item),price=n('price'),active=s.holds.find(h=>h.item===i.id&&h.status==='reserved');
    fail(price<i.min,'السعر دون الحد الأدنى');fail(!['available','reserved'].includes(i.status),'القطعة غير صالحة للحجز');
    fail(i.status==='reserved'&&!p.wait,'محجوزة لدى '+(active?.account||'زبون آخر'));
    fail(i.status==='available'&&p.wait,'القطعة متاحة ويمكن حجزها مباشرة');
    const platform=str('platform',true),account=str('account',true);
    fail(s.holds.some(h=>h.item===i.id&&['reserved','wait'].includes(h.status)&&normalize(h.platform)===normalize(platform)&&normalize(h.account)===normalize(account)),'يوجد حجز أو انتظار لنفس الحساب');
    hold({item:i.id,stream:b.id,platform,account,phone:str('phone'),price,status:p.wait?'wait':'reserved'});slot.shown=true;
    i.status='reserved';break
  }
  case 'release':
  case 'transfer':{
    const h=row('holds',p.id);str('note',true);fail(h.status!=='reserved','الحجز غير نشط');
    h.status='released';item(h.item).status='available';
    if(type==='transfer'){const next=s.holds.find(x=>x.item===h.item&&x.status==='wait');fail(!next,'قائمة الانتظار فارغة');next.status='reserved';next.until=new Date(Date.parse(now)+s.settings.minutes*60000).toISOString();item(h.item).status='reserved'}break
  }
  case 'customer':{
    const data={name:str('name',true),phone:str('phone'),platform:str('platform'),account:str('account'),province:str('province'),area:str('area'),address:str('address'),note:str('note')};
    fail(!data.phone&&!(data.account&&data.platform),'أدخل هاتفاً أو حساباً ومنصة');
    const phone=v=>normalize(v).replace(/[^\d+]/g,'');
    fail(s.customers.some(c=>c.id!==p.id&&((phone(data.phone)&&phone(c.phone)===phone(data.phone))||(data.account&&data.platform&&normalize(c.account)===normalize(data.account)&&normalize(c.platform)===normalize(data.platform)))),'هوية الزبون موجودة');
    if(p.id)Object.assign(row('customers',p.id),data);else add('customers',data);break
  }
  case 'combine':{
    const c=row('customers',p.customer);
    const hs=(p.holds||[]).map(id=>row('holds',id)),phone=v=>normalize(v).replace(/\D/g,'');
    fail(hs.some(h=>h.status!=='reserved'||!((phone(h.phone)&&phone(h.phone)===phone(c.phone))||(normalize(h.platform)===normalize(c.platform)&&normalize(h.account)===normalize(c.account)))),'طابق الهاتف أو حساب المنصة مع كل حجز');
    const o=order(hs.map(h=>h.item),hs.map(h=>({item:h.item,price:h.price,stream:h.stream,hold:h.id})),c.id,p.ship,n('delivery'),n('discount'),p.method);
    for(const h of hs){h.status='ordered';h.order=o.id}break
  }
  case 'quick':{
    const ids=p.items||[];for(const id of ids)fail(item(id).status!=='available','القطعة غير متاحة، راجع الحجز من شاشة البث');
    if(p.customer)row('customers',p.customer);
    deliver(order(ids,ids.map(id=>({item:id,price:item(id).price,stream:''})),p.customer||'','shop',0,n('discount'),p.method));break
  }
  case 'orderStatus':{
    const o=row('orders',p.id),next=p.status;
    const steps={pending:['confirmed','cancelled'],confirmed:['packing','cancelled'],packing:['ready','cancelled'],ready:[o.ship==='delivery'?'sent':'delivered','cancelled'],sent:['delivered','cancelled']};
    fail(!steps[o.status]?.includes(next),'انتقال حالة غير متاح');
    if(next==='cancelled'){str('note',true);o.cancelledAt=now;for(const l of o.lines){item(l.item).status=o.status==='sent'?'inspection':'available';if(l.hold)row('holds',l.hold).status='released'}}
    if(next==='sent'){o.carrier=str('carrier',true);o.tracking=str('tracking',true);o.fee=n('fee');fail(s.orders.some(x=>x.id!==o.id&&normalize(x.carrier)===normalize(o.carrier)&&normalize(x.tracking)===normalize(o.tracking)),'رقم الشحنة مسجل لدى الشركة');}
    if(next==='delivered')deliver(o);else o.status=next;break
  }
  case 'return':{
    const o=row('orders',p.id),l=o.lines.find(l=>l.item===p.item),refund=n('refund'),shipping=n('shipping');
    fail(!['delivered','partial'].includes(o.status)||!l||l.returned||refund>l.net,'بند أو مبلغ غير صالح للإرجاع');
    const note=str('note',true);
    let replacement='';
    if(p.replacement){const substitute=item(p.replacement);fail(substitute.status!=='available','قطعة الاستبدال غير متاحة');const exchange=order([substitute.id],[{item:substitute.id,price:substitute.price,stream:''}],o.customer,'shop',0,0,p.method);deliver(exchange);replacement=exchange.id;}
    l.returned=true;item(l.item).status='inspection';item(l.item).returnedAt=now;
    o.status=o.lines.every(x=>x.returned)?'returned':'partial';
    const r=add('returns',{order:o.id,item:l.item,refund,shipping,note,cost:l.cost,stream:l.stream,replacement});
    if(refund+shipping)ledger('refund',-(refund+shipping),p.method,r.id,note);break
  }
  case 'payout':{
    const o=row('orders',p.id),amount=n('amount'),charges=n('charges'),withheld=n('withheld'),difference=n('difference'),reference=str('reference',true);
    fail(o.ship!=='delivery'||!o.deliveredAt||!amount&&!charges&&!difference&&!withheld||o.paidOut+amount+charges+difference+withheld>o.collected,'التسوية تتجاوز رصيد الشحنة');
    fail(s.settlements.some(x=>x.order===o.id&&normalize(x.reference)===normalize(reference)),'هذا التحصيل مسجل للشحنة');
    fail(s.settlements.filter(x=>x.order===o.id).reduce((a,x)=>a+(x.withheld||0),0)+withheld>o.fee,'الأجرة المقتطعة أكبر من الأجرة المسجلة للشحنة');
    const q=add('settlements',{order:o.id,reference,amount,charges,withheld,difference,note:str('note',Boolean(difference)),carrier:o.carrier});o.paidOut+=amount+charges+withheld+difference;ledger('payout',amount,p.method,q.id);break
  }
  case 'money':{
    fail(!['expense','withdraw','capital'].includes(p.kind),'نوع حركة غير صالح');const amount=n('amount');fail(!amount,'المبلغ مطلوب');
    ledger(p.kind,p.kind==='capital'?amount:-amount,p.method,'',str('note',true));break
  }
  case 'closeCash':{
    const actual=n('actual'),expected=s.money.filter(m=>m.method==='cash').reduce((a,m)=>a+m.amount,0);
    fail(s.money.some(m=>m.kind==='close'&&day(m.at)===day(now)),'أُغلق صندوق هذا اليوم');
    add('money',{kind:'close',amount:0,method:'cash',actual,expected,note:str('note',actual!==expected)});break
  }
  default:throw Error('عملية غير معروفة');
  }
  add('audit',{type,ref:p.id||p.stream||'',note:String(p.note||''),values:Object.fromEntries(Object.entries(p).filter(([k])=>!['photos','logo'].includes(k)))});
  return validate(s);
}
export function report(s,f={}){
  const inPeriod=t=>Boolean(t&&(!f.from||day(t)>=f.from)&&(!f.to||day(t)<=f.to));
  const sum=(rows,fn)=>rows.reduce((a,r)=>a+fn(r),0);
  const scoped=Boolean(f.stream||f.batch||f.supplier||f.category||f.carrier);
  const match=(l,o)=>{
    const i=s.items.find(x=>x.id===l.item),b=s.batches.find(x=>x.id===i?.batch);
    return (!f.stream||l.stream===f.stream)&&(!f.batch||i?.batch===f.batch)&&(!f.supplier||b?.supplier===f.supplier)&&(!f.category||normalize(i?.category)===normalize(f.category))&&(!f.carrier||normalize(o.carrier)===normalize(f.carrier));
  };
  const sold=s.orders.filter(o=>inPeriod(o.deliveredAt));
  const lines=sold.flatMap(o=>o.lines.filter(l=>match(l,o)).map(l=>({...l,order:o.no,date:o.deliveredAt})));
  const returns=s.returns.filter(r=>inPeriod(r.at)&&match(r,s.orders.find(o=>o.id===r.order)));
  const moves=s.money.filter(m=>inPeriod(m.at));
  const allDelivered=s.orders.filter(o=>o.deliveredAt&&o.ship==='delivery');
  const payouts=s.settlements.filter(x=>inPeriod(x.at)&&(!f.carrier||normalize(x.carrier)===normalize(f.carrier)));
  const sales=sum(lines,l=>l.net)-sum(returns,r=>r.refund),cost=sum(lines,l=>l.cost)-sum(returns,r=>r.cost);
  const shipOrders=sold.flatMap(o=>{
    if(!scoped)return [o];
    const indices=o.lines.map((l,j)=>match(l,o)?j:-1).filter(j=>j>=0);
    if(!indices.length)return [];
    const weights=o.lines.some(l=>l.net>0)?o.lines.map(l=>l.net):o.lines.map(()=>1);
    const delivery=allocate(o.delivery,weights),fee=allocate(o.fee,weights);
    return [{...o,delivery:sum(indices,j=>delivery[j]),fee:sum(indices,j=>fee[j])}];
  });
  const delivery=sum(shipOrders,o=>o.delivery), fees=sum(shipOrders,o=>o.fee), returnFees=sum(returns,r=>r.shipping);
  const expenses=scoped?0:-sum(moves.filter(m=>m.kind==='expense'),m=>m.amount);
  const deductions=f.stream||f.batch||f.supplier||f.category?0:sum(payouts,p=>p.charges+p.difference);
  const outstanding=allDelivered.filter(o=>!f.carrier||normalize(o.carrier)===normalize(f.carrier));
  const sent=s.orders.filter(o=>o.status==='sent');
  const stock=s.items.filter(i=>['inspection','available','reserved'].includes(i.status));
  const matchingStock=stock.filter(i=>match({item:i.id,stream:f.stream&&s.streams.some(b=>b.id===f.stream&&b.slots.some(x=>x.item===i.id))?f.stream:''},{carrier:''}));
  return {sales,cost,gross:sales-cost,delivery,fees,returnFees,expenses,deductions,net:sales-cost+delivery-fees-returnFees-expenses-deductions,
    received:sum(moves.filter(m=>['payout','sale'].includes(m.kind)),m=>m.amount),
    cash:sum(s.money.filter(m=>m.method==='cash'),m=>m.amount), transfers:sum(s.money.filter(m=>m.method==='transfer'),m=>m.amount),
    inventory:sum(stock,i=>i.cost+i.repair),sent:sum(sent,o=>sum(o.lines,l=>l.cost)),
    due:sum(outstanding,o=>o.collected-o.paidOut),suppliers:sum(s.batches,b=>b.purchase+b.shipping-b.paid),
    cancellations:s.orders.filter(o=>o.status==='cancelled'&&inPeriod(o.cancelledAt)&&o.lines.some(l=>match(l,o))),
    shipOrders,stock,stale:matchingStock.filter(i=>i.status==='available'&&Date.now()-Date.parse(i.at)>90*86400000),lines,returns,moves,outstanding,sentOrders:sent,payouts};
}
