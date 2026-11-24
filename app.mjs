import {empty,day,normalize,statuses,report,roles} from './core.mjs';
import {openDb,access,initialize,localAction,api,backup,unpack,save} from './storage.mjs';
const $=id=>document.getElementById(id), main=$('main'), dialog=$('dialog');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>new Intl.NumberFormat('ar-IQ').format(v);
const money=v=>fmt(v)+' د.ع.';
const when=v=>v?new Intl.DateTimeFormat('ar-IQ',{timeZone:'Asia/Baghdad',dateStyle:'short',timeStyle:'short'}).format(new Date(v)):'—';
const btn=(label,fn,cls='')=>{const id='b'+(++serial); handlers.set(id,fn);return '<button type="button" class="'+cls+'" data-action="'+id+'">'+label+'</button>'};
const icon=v=>'<span class="icon" aria-hidden="true">'+v+'</span>';
const pill=v=>'<span class="pill '+(['available','delivered','ready','confirmed'].includes(v)?'good':['cancelled','damaged','returned'].includes(v)?'bad':'')+'">'+esc(statuses[v]||({wait:'◷ انتظار',released:'× محرر',ordered:'✓ ضمن طلب'}[v])||v)+'</span>';
const table=(key,heads,rows,emptyText='لا توجد سجلات بعد')=>{
  if(!rows.length)return '<p class="empty">'+emptyText+'</p>';
  const sort=sorting[key];
  if(sort)rows=[...rows].sort((a,b)=>sort.dir*(typeof a[sort.index]==='number'&&typeof b[sort.index]==='number'?a[sort.index]-b[sort.index]:String(a[sort.index]??'').replace(/<[^>]+>/g,'').localeCompare(String(b[sort.index]??'').replace(/<[^>]+>/g,''),'ar',{numeric:true})));
  return '<div class="table-scroll"><table><thead><tr>'+heads.map((h,i)=>'<th scope="col">'+(h?btn(esc(h)+(sort?.index===i?(sort.dir===1?' ▴':' ▾'):''),()=>{sorting[key]={index:i,dir:sort?.index===i?-sort.dir:1};render()}) :'')+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
};
const section=(title,html)=>'<section class="card section"><h2>'+title+'</h2>'+html+'</section>';
const brand=()=>'<div class="brand"><img alt="" src="'+esc(s.settings.logo||'./icon-192.png')+'"><div><strong>'+esc(s.settings.name)+'</strong><small>إدارة المتجر</small></div></div>';
const heading=(title,sub='',actions='')=>'<div class="heading"><div><h1>'+title+'</h1>'+(sub?'<p class="muted">'+sub+'</p>':'')+'</div><div class="actions">'+actions+'</div></div>';
const options=(rows,label='name')=>rows.map(r=>[r.id,typeof label==='function'?label(r):r[label]]);
const pick=(group,id)=>s[group].find(r=>r.id===id);
const itemName=id=>{const i=pick('items',id);return i?i.code+' · '+i.name:'—'};
const orderName=id=>'#'+fmt(pick('orders',id)?.no||0);
const newest=rows=>[...rows].reverse();
const moneyLabels={sale:'بيع',supplier:'دفعة مورد',refund:'مرتجع',payout:'حوالة توصيل',expense:'مصروف',withdraw:'سحب مالك',capital:'إيداع رأس مال',close:'إغلاق صندوق'};
const methods=[['cash','نقد'],['transfer','تحويل']];
const shipping=[['shop','استلام من المحل'],['delivery','توصيل']];
const steps={pending:['confirmed','cancelled'],confirmed:['packing','cancelled'],packing:['ready','cancelled'],ready:['sent','delivered','cancelled'],sent:['delivered','cancelled']};
const handlers=new Map(),sorting={};
let serial=0,s=empty(),db,cache,session=null,mode=localStorage.getItem('aa-mode')||'',page='home',connected=false,offlineReady=false,promptInstall,query='',stockFilter='',orderFilter='',selectedStream='',busy=false,toastTimer,filter={},setupError='';
const finance=()=>mode!=='shared'||['owner','account'].includes(session?.role);
const owner=()=>mode!=='shared'||session?.role==='owner';
const permitted=(...r)=>owner()||r.includes(session?.role);
const canWrite=()=>mode!=='shared'||connected;
const holdExpiry=h=>h.status==='reserved'&&Date.parse(h.until)<=Date.now();
function toast(msg){$('toast').textContent=msg;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').textContent='',4000)}
function go(p){page=p;query='';render();window.scrollTo(0,0)}
function modal(title,body){
  dialog.innerHTML='<div class="topline no-print"><h2>'+title+'</h2>'+btn('إغلاق',()=>dialog.close())+'</div>'+body;
  if(!dialog.open)dialog.showModal();
}
function field(name,label,kind='text',value='',extra={}){
  let input;
  if(Array.isArray(kind))input='<select name="'+name+'" '+(extra.multiple?'multiple ':'')+(extra.required?'required':'')+'>'+kind.map(([k,v])=>'<option value="'+esc(k)+'" '+((Array.isArray(value)?value.includes(k):String(k)===String(value))?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select>';
  else if(kind==='area')input='<textarea name="'+name+'" '+(extra.required?'required':'')+'>'+esc(value)+'</textarea>';
  else input='<input name="'+name+'" type="'+kind+'" '+(kind==='file'?'accept="image/png,image/jpeg,image/webp,image/gif" '+(extra.multiple?'multiple':''):'value="'+esc(value)+'"')+(kind==='checkbox'&&value?' checked':'')+(extra.required?' required':'')+(extra.numeric?' inputmode="numeric"':'')+'>';
  return '<label class="'+(extra.wide?'wide ':'' )+(kind==='checkbox'?'check ':'')+(extra.big?'big':'')+'">'+(kind==='checkbox'?input+' '+label:label+input)+'</label>';
}
const f=field;
const required=(name,label,value='',extra={})=>f(name,label,'text',value,{required:true,...extra});
const amount=(name,label,value=0)=>f(name,label,'text',value,{numeric:true,required:true});
const pay=()=>f('method','طريقة الدفع',methods);
const select=(name,label,rows,optional=false,value='',multi=false)=>f(name,label,[...(optional?[['','—']]:[]),...rows],value,{required:!optional,multiple:multi,wide:multi});
const photo=file=>new Promise((resolve,reject)=>{
  if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)||file.size>3*1024*1024)return reject(Error('استخدم صورة PNG أو JPEG أو WEBP أو GIF بحجم لا يتجاوز ٣ ميغابايت'));
  const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file);
});
async function perform(type,payload){
  if(!canWrite())throw Error('الكتابة تحتاج اتصالاً بخادم المحل');
  try{
    if(mode==='shared'){
      const next=await api('action',session?.token,{type,payload});
      s=next;await saveCache().catch(()=>{});
    }else s=await localAction(db,type,payload);
  }catch(e){if(e.offline){connected=false;renderTop()}throw e}
}
function form(title,fields,action,config={}){
  modal(title,'<form><div class="form-grid">'+fields+'</div><p class="error" role="alert"></p><button class="primary" type="submit" '+(config.disabled?'disabled':'')+'>'+ (config.submit||'حفظ')+'</button></form>');
  const el=dialog.querySelector('form');
  el.addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;
    busy=true;const submit=el.querySelector('[type=submit]');submit.disabled=true;
    const error=el.querySelector('.error');error.textContent='';
    try{
      const fd=new FormData(el),data={...Object.fromEntries(fd),...config.fixed};
      for(const input of el.querySelectorAll('select[multiple]'))data[input.name]=fd.getAll(input.name);
      for(const input of el.querySelectorAll('input[type=file]')){
        const images=await Promise.all([...input.files].map(photo));
        data[input.name]=input.multiple?images:images[0]||'';
      }
      if(typeof action==='string')await perform(action,data);else await action(data,el);
      if(config.after){render();config.after()} else if(!config.keep){dialog.close();render();toast(config.success||'تم الحفظ')}
    }catch(e){error.textContent=e.message}
    finally{busy=false;submit.disabled=false}
  });
}
const editCustomer=(c,after)=>form(c?.id?'تعديل الزبون':'زبون جديد',required('name','الاسم',c?.name)+f('phone','الهاتف','tel',c?.phone)+f('platform','المنصة','text',c?.platform)+f('account','معرّف الحساب','text',c?.account)+f('province','المحافظة','text',c?.province)+f('area','المنطقة','text',c?.area)+f('address','العنوان','area',c?.address,{wide:true})+f('note','ملاحظات','area',c?.note,{wide:true}),'customer',{fixed:{id:c?.id},after});
function itemEditor(i){
  const val=k=>i?.[k]??'';
  form(i?'تعديل القطعة':'إضافة بضاعة',required('name','اسم القطعة',val('name'))+required('code','الكود الداخلي',val('code'))+f('barcode','الباركود','text',val('barcode'))+f('category','التصنيف','text',val('category'))+f('location','مكان التخزين','text',val('location'))+(i?'':amount('quantity','الكمية',1)+select('batch','دفعة الشراء',options(s.batches),true))+amount('price','سعر العرض',val('price')||0)+amount('min','أدنى سعر',val('min')||0)+amount('cost','التكلفة الأولية',val('cost')||0)+amount('repair','تكلفة التصليح',val('repair')||0)+f('photos','صور القطعة','file','',{multiple:true,wide:true})+f('missing','ملحقات ناقصة','text',val('missing'))+f('defect','ملاحظات العيوب','text',val('defect'))+(i?f('note','سبب تغيير السعر أو التكلفة','area','',{wide:true}):''),'item',{fixed:{id:i?.id}});
}
function quick(){
  const reserved=s.holds.filter(h=>h.status==='reserved');
  const review=reserved.length?'<p class="wide muted">حجوزات قائمة · '+reserved.map(h=>btn(esc(itemName(h.item)+' · '+h.account),()=>{selectedStream=h.stream;dialog.close();go('live')})).join(' ')+'</p>':'';
  form('بيع سريع داخل المحل',review+select('items','القطع المتاحة',options(s.items.filter(i=>i.status==='available'),i=>itemName(i.id)+' · '+money(i.price)),false,[],true)+select('customer','الزبون',options(s.customers),true)+amount('discount','الخصم')+pay(),async data=>{await perform('quick',data);render();receipt(s.orders.at(-1));toast('تم البيع')},{keep:true});
}
function printView(title,content,format='a4',sale=false){
  const sizes=[['a4','A4'],['80','٨٠ مم']].map(([size,label])=>btn(label,()=>printView(title,content,size,sale),size===format?'primary':'')).join('');
  const header=sale
    ? '<header class="receipt-header"><div class="receipt-brand"><img alt="" src="'+esc(s.settings.logo||'./icon-192.png')+'"><div><h2>'+esc(s.settings.name)+'</h2><p>'+esc([s.settings.phone,s.settings.address].filter(Boolean).join(' · '))+'</p></div></div><strong>'+esc(title)+'</strong></header>'
    : '<h2>'+esc(s.settings.name)+'</h2><p>'+esc(s.settings.phone)+' '+esc(s.settings.address)+'</p><h2>'+esc(title)+'</h2>';
  modal('معاينة الطباعة','<div class="toolbar no-print">'+sizes+btn('طباعة',()=>window.print(),'primary')+'</div><article class="printSheet'+(sale?' sale-receipt':'')+(format==='80'?' narrow':'')+'">'+header+content+'</article>');
}
function inspect(i){form('فحص '+esc(i.code),select('status','نتيجة الفحص',[['available','متاحة للبيع'],['damaged','تالفة']])+f('defect','حالة الفحص والعيوب','area',i.defect,{wide:true}),'inspect',{fixed:{id:i.id}})}
function count(i){form('جرد '+esc(i.code),amount('actual','الكمية الفعلية لهذه الوحدة',1)+f('adjust','تسوية حالة القطعة','checkbox',false)+f('note','سبب الفرق','area','',{wide:true}),'count',{fixed:{id:i.id}})}
function itemDetails(i){
  modal(esc(itemName(i.id)),'<div class="stack"><p>'+pill(i.status)+' '+esc(i.barcode)+' '+esc(i.location)+'</p><p>'+money(i.price)+(finance()?' · التكلفة '+money(i.cost+i.repair):'')+'</p><p>'+esc([i.category,i.missing,i.defect].filter(Boolean).join(' · '))+'</p>'+i.photos.map(p=>'<img class="picture" alt="صورة القطعة" src="'+esc(p)+'">').join('')+'<div class="actions">'+btn('ملصق القطعة',()=>printView('ملصق القطعة','<p>'+esc(itemName(i.id))+'</p><p>'+esc(i.barcode)+'</p><p>'+money(i.price)+'</p>','80'))+(owner()?btn('تعديل',()=>itemEditor(i)):'')+(permitted('pack')&&i.status==='inspection'?btn('نتيجة الفحص',()=>inspect(i),'primary'):'')+(permitted('pack')&&i.status!=='sold'?btn('جرد',()=>count(i)):'')+'</div></div>');
}
function inventory(){
  const rows=s.items.filter(i=>!stockFilter||i.status===stockFilter||(stockFilter==='returnedInspection'&&i.status==='inspection'&&i.returnedAt));
  return heading('البضاعة','المخزون والفحص والجرد',owner()?btn('بيع سريع',quick)+btn('إضافة قطعة',()=>itemEditor(),'primary'):'')+
    '<div class="toolbar">'+['','available','inspection','returnedInspection','reserved','sold','damaged'].map(v=>btn(v==='returnedInspection'?'مرتجعات للفحص':v?esc(statuses[v]):'الكل',()=>{stockFilter=v;render()},v===stockFilter?'primary':'')).join('')+btn('مسح باركود',scan)+'</div>'+
    section('سجل البضاعة',table('items',['الكود','القطعة','التصنيف','المكان','الحالة','سعر العرض',''],rows.map(i=>[esc(i.code),(i.photos[0]?'<img class="thumb" alt="" src="'+esc(i.photos[0])+'"> ':'')+esc(i.name),esc(i.category),esc(i.location),pill(i.status),money(i.price),btn('فتح',()=>itemDetails(i))]),'أضف قطعة لبدء تسجيل المخزون'))+
    section('سجل الجرد',table('counts',['القطعة','المتوقع','الفعلي','التسوية','السبب','الموظف'],newest(s.counts).map(c=>[esc(itemName(c.item)),c.expected,c.actual,c.adjusted?'تمت':'—',esc(c.note),esc(c.by)])));
}
async function scan(){
  if(!('BarcodeDetector' in window)||!navigator.mediaDevices?.getUserMedia){toast('المسح غير مدعوم هنا. أدخل الباركود في البحث.');$('search').focus();return}
  modal('مسح الباركود','<video class="picture" playsinline autoplay muted></video><p class="error"></p>');
  const video=dialog.querySelector('video');
  let stream;
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    video.srcObject=stream;
    const detector=new BarcodeDetector();
    while(dialog.open&&dialog.contains(video)){
      const result=video.readyState>=2?await detector.detect(video):[];
      if(result.length){dialog.close();query=result[0].rawValue;render();break}
      await new Promise(r=>setTimeout(r,220));
    }
  }catch(e){toast('تعذر فتح الكاميرا. استخدم البحث اليدوي.');dialog.close()}
  finally{stream?.getTracks().forEach(t=>t.stop())}
}
function purchases(){
  if(!finance())return heading('المشتريات')+'<p class="notice">صلاحية المالك أو المحاسب مطلوبة.</p>';
  const supplier=()=>form('مورد جديد',required('name','الاسم')+f('phone','الهاتف','tel')+f('note','ملاحظات','area'),'supplier');
  const batch=()=>form('دفعة شراء',required('name','اسم الدفعة')+select('supplier','المورد',options(s.suppliers))+f('date','تاريخ الشراء','date',day(),{required:true})+amount('purchase','مبلغ الشراء')+amount('shipping','شحن الدفعة')+amount('paid','المدفوع')+pay(),'batch');
  function distribute(b){
    const items=s.items.filter(i=>i.batch===b.id);
    form('توزيع تكلفة '+esc(b.name),'<p class="wide">'+money(b.purchase+b.shipping)+'</p><p class="wide">'+esc(items.map(i=>i.code).join(' · '))+'</p>'+select('mode','طريقة التوزيع',[['equal','بالتساوي'],['weighted','أوزان نسبية'],['manual','مبالغ يدوية']])+f('values','القيم بالترتيب، افصل بينها بمسافات','area','',{wide:true})+required('note','سبب التوزيع أو إعادة التوزيع'),'allocate',{fixed:{id:b.id}});
  }
  return heading('المشتريات','دفعات الشراء وتكاليفها وأرصدة الموردين',owner()?btn('إضافة مورد',supplier)+btn('دفعة شراء',batch,'primary'):'')+
    section('دفعات الشراء',table('batches',['الدفعة','المورد','التاريخ','الإجمالي','المدفوع','المتبقي',''],newest(s.batches).map(b=>[esc(b.name),esc(pick('suppliers',b.supplier)?.name),esc(b.date),money(b.purchase+b.shipping),money(b.paid),money(b.purchase+b.shipping-b.paid),(owner()?btn('توزيع التكلفة',()=>distribute(b))+' ':'')+btn('دفعة للمورد',()=>form('دفعة إلى المورد',amount('amount','المدفوع')+pay()+required('note','بيان الدفعة'),'supplierPayment',{fixed:{id:b.id}}))])))+
    section('الموردون',table('suppliers',['الاسم','الهاتف','ملاحظات'],s.suppliers.map(x=>[esc(x.name),esc(x.phone),esc(x.note)])));
}
function streamPage(){
  const b=pick('streams',selectedStream)||s.streams.at(-1);
  const make=existing=>form(existing?'تعديل ترتيب الجلسة':'جلسة بث جديدة',required('name','عنوان الجلسة',existing?.name)+f('date','تاريخ البث','date',existing?.date||day(),{required:true})+select('items','القطع المتاحة بالترتيب الظاهر',options(s.items.filter(i=>i.status==='available'),i=>itemName(i.id)),false,existing?.slots.map(x=>x.item)||[],true)+f('order','أكواد القطع بالترتيب المطلوب، تفصلها فاصلة عند الحاجة','area','',{wide:true}),async data=>{
    const codes=data.order.split(/[,،]/).map(normalize).filter(Boolean);
    if(codes.length){data.items=codes.map(code=>s.items.find(i=>normalize(i.code)===code)?.id);if(data.items.includes(undefined))throw Error('تحقق من أكواد القطع')}
    await perform(existing?'editStream':'stream',{...data,id:existing?.id});selectedStream=existing?.id||s.streams.at(-1).id;
  });
  const holds=b?s.holds.filter(h=>h.stream===b.id):[];
  const reserve=(no='',wait=false)=>form(wait?'إضافة إلى الانتظار':'حجز من البث',required('no','رقم العرض',no,{numeric:true,big:true})+required('account','اسم أو معرّف حساب الزبون')+required('platform','المنصة','فيسبوك')+amount('price','السعر',b?.slots.find(x=>String(x.no)===String(no))?pick('items',b.slots.find(x=>String(x.no)===String(no)).item).price:0)+f('phone','الهاتف لاحقاً عند توفره','tel')+f('wait','إضافة للانتظار عند وجود حجز','checkbox',wait),'hold',{fixed:{stream:b.id}});
  const fast=()=>'<form id="fastHold" class="card context"><div class="toolbar"><label class="big">رقم العرض<input name="slot" inputmode="numeric" required></label><button class="primary" type="submit">حجز</button></div><p class="error" role="alert"></p></form>';
  const combine=(draft={})=>{
    const active=s.holds.filter(h=>h.status==='reserved');
    const holds=select('holds','الحجوزات النشطة من كل الجلسات',options(active,h=>h.account+' · '+itemName(h.item)+' · '+pick('streams',h.stream)?.name),false,draft.holds||[],true);
    const create=btn('زبون جديد',()=>{
      const data=new FormData(dialog.querySelector('form'));
      const chosen=data.getAll('holds');
      const h=active.find(x=>x.id===chosen[0])||(active.length===1?active[0]:null);
      editCustomer(h?{name:h.account,phone:h.phone,platform:h.platform,account:h.account}:null,()=>{
        combine({...Object.fromEntries(data),holds:chosen.length?chosen:h?[h.id]:[],customer:s.customers.at(-1).id});
      });
    },s.customers.length?'':'primary');
    const customerField=s.customers.length?select('customer','الزبون',options(s.customers),false,draft.customer):'<p class="wide notice">أضف زبوناً واربط حسابه أو هاتفه بالحجز حتى تكمل الطلب.</p>';
    form('تجميع الحجوزات في طلب',customerField+'<div class="wide">'+create+'</div>'+holds+select('ship','طريقة التسليم',shipping,false,draft.ship)+amount('delivery','التوصيل على الزبون',draft.delivery??0)+amount('discount','الخصم',draft.discount??0)+select('method','طريقة الدفع',methods,false,draft.method),'combine',{disabled:!s.customers.length});
  };
  const manage=h=>modal('حجز '+esc(h.account),'<p>'+esc(itemName(h.item))+' · '+esc(when(h.until))+'</p><p>التالي في الانتظار '+esc(s.holds.find(x=>x.item===h.item&&x.status==='wait')?.account||'—')+'</p><div class="toolbar">'+btn('تحرير الحجز',()=>form('تحرير الحجز',required('note','سبب التحرير'),'release',{fixed:{id:h.id}}),'danger')+btn('نقل إلى التالي',()=>form('نقل الحجز إلى المنتظر التالي',required('note','سبب النقل'),'transfer',{fixed:{id:h.id}}))+'</div>');
  return heading('البث','جلسات العرض والحجوزات اليدوية',permitted('live')?btn('جلسة جديدة',()=>make(),'primary'):'')+
    (b?(permitted('live')?fast():'')+'<div class="toolbar"><label>الجلسة<select id="chooseStream">'+s.streams.map(x=>'<option value="'+x.id+'" '+(x.id===b.id?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label>'+pill(b.status)+(permitted('live')?btn('حجز برقم العرض',()=>reserve(),'primary')+(b.status==='open'&&!b.slots.some(x=>x.shown)?btn('تعديل ترتيب الجلسة',()=>make(b)):'')+btn('تجميع الحجوزات',combine)+btn('زبون جديد',()=>editCustomer())+(b.status==='open'?btn('إنهاء البث',()=>form('إنهاء البث','<p class="wide">تفتح ملخص الجلسة بعد إنهائها. يمكنك تسجيل حجوزات التعليقات لاحقاً.</p>','end',{fixed:{id:b.id},submit:'إنهاء البث'})):''):'')+'</div>'+
      (b.status==='closed'?'<p class="notice">بانتظار التأكيد '+fmt(s.orders.filter(o=>o.status==='pending'&&o.lines.some(l=>l.stream===b.id)).length)+' · حجوزات معلقة '+fmt(holds.filter(h=>h.status==='reserved').length)+' · انتظار '+fmt(holds.filter(h=>h.status==='wait').length)+' · متاحة '+fmt(b.slots.filter(x=>pick('items',x.item)?.status==='available').length)+'</p>':'')+
      section('قطع الجلسة',table('slots',['العرض','القطعة','السعر','الحالة','العرض أمام الكاميرا',''],b.slots.map(slot=>{
        const i=pick('items',slot.item);
        return [slot.no,esc(itemName(i.id)),money(i.price),pill(i.status),slot.shown?'تم العرض':b.status==='open'&&permitted('live')?btn('تسجيل العرض',()=>run('show',{stream:b.id,no:slot.no})):'—',btn('كارت',()=>printView('رقم العرض '+fmt(slot.no),'<p>'+esc(i.name)+'</p><p>'+money(i.price)+'</p>','80'))+' '+(permitted('live')&&['available','reserved'].includes(i.status)?btn(i.status==='reserved'?'انتظار':'حجز',()=>reserve(slot.no,i.status==='reserved')).replace('<button ','<button data-slot="'+slot.no+'" '):'')];
      })))+
      section('الحجوزات والانتظار',table('holds',['القطعة','الحساب','المنصة','الحالة','المهلة',''],newest(holds).map(h=>[esc(itemName(h.item)),esc(h.account),esc(h.platform),pill(h.status),holdExpiry(h)?'<span class="error">تحتاج مراجعة</span>':esc(when(h.until)),h.status==='reserved'&&permitted('live')?btn('مراجعة',()=>manage(h)):''])))
      :section('جلسات البث','<p class="empty">أنشئ جلسة بعد إتاحة القطع في المخزون.</p>'));
}
async function run(type,payload){if(busy)return;busy=true;try{await perform(type,payload);render();toast('تم الحفظ')}catch(e){toast(e.message)}finally{busy=false}}

function receipt(o,kind='receipt'){
  const c=pick('customers',o.customer),total=o.lines.reduce((a,l)=>a+l.net,0);
  const address=esc([c?.province,c?.area,c?.address].filter(Boolean).join(' · '));
  if(kind==='parcel')return printView('ملصق طرد '+orderName(o.id),'<p>'+esc(c?.name)+' · '+esc(c?.phone)+'</p><p>'+address+'</p><p>'+esc(o.carrier)+' · '+esc(o.tracking)+'</p><p>المطلوب '+money(total+o.delivery)+'</p>','80');
  if(kind==='packing')return printView('قائمة تجهيز '+orderName(o.id),'<p>'+esc(c?.name)+'</p>'+table('printPacking',['✓','القطعة','الموقع'],o.lines.filter(l=>!l.returned).map(l=>['□',esc(itemName(l.item)),esc(pick('items',l.item)?.location)])));
  const fields=c?[
    ['الاسم الكامل',c.name],['رقم الهاتف',c.phone],['المنصّة',c.platform],
    ['معرّف الحساب',c.account],['المحافظة',c.province],['المنطقة',c.area],
    ['العنوان الكامل',c.address,true],['ملاحظات الزبون',c.note,true]
  ]:[['الزبون','بيع مباشر بدون ملف زبون',true]];
  const customer='<dl class="receipt-fields">'+fields.map(([label,value,wide])=>'<div'+(wide?' class="receipt-wide"':'')+'><dt>'+label+'</dt><dd><bdi>'+esc(value||'—')+'</bdi></dd></div>').join('')+'</dl>';
  const meta='<div class="receipt-meta"><span>'+esc(when(o.deliveredAt||o.at))+'</span><span>'+(o.ship==='delivery'?'توصيل':'استلام من المحل')+'</span></div>';
  const lines='<table class="receipt-lines"><thead><tr><th scope="col">القطعة</th><th scope="col">السعر الصافي</th></tr></thead><tbody>'+o.lines.map(l=>'<tr><td>'+esc(itemName(l.item))+(l.returned?' <small>راجع</small>':'')+'</td><td><bdi>'+money(l.net)+'</bdi></td></tr>').join('')+'</tbody></table>';
  const totals='<dl class="receipt-totals"><div><dt>صافي البضاعة</dt><dd>'+money(total)+'</dd></div><div><dt>التوصيل</dt><dd>'+money(o.delivery)+'</dd></div><div class="receipt-grand"><dt>إجمالي الطلب</dt><dd>'+money(total+o.delivery)+'</dd></div></dl>';
  return printView('وصل بيع '+orderName(o.id),meta+'<section class="receipt-customer"><h3>معلومات الزبون</h3>'+customer+'</section>'+lines+totals,'80',true);
}
function confirmation(o){
  const c=pick('customers',o.customer),total=o.lines.reduce((a,l)=>a+l.net,0);
  const message=['مرحباً '+(c?.name||''),'تأكيد طلب '+orderName(o.id),...o.lines.map(l=>itemName(l.item)+' — '+money(l.net)),'التوصيل '+money(o.delivery),'المجموع '+money(total+o.delivery),'العنوان '+[c?.province,c?.area,c?.address].filter(Boolean).join('، ')].join('\n');
  modal('رسالة التأكيد','<div class="form-grid">'+f('message','النص','area',message,{wide:true})+'</div>'+btn('نسخ الرسالة',async()=>{const field=dialog.querySelector('textarea');try{await navigator.clipboard.writeText(field.value);toast('تم النسخ')}catch{field.select();toast('النص محدد للنسخ اليدوي')}},'primary'));
}
function orderDetails(o){
  const c=pick('customers',o.customer),next=(steps[o.status]||[]).filter(x=>o.status!=='ready'||x===(o.ship==='delivery'?'sent':'delivered')||x==='cancelled');
  const update=status=>form('تغيير حالة '+orderName(o.id),'<p class="wide">'+pill(status)+'</p>'+
    (status==='sent'?required('carrier','شركة التوصيل')+required('tracking','رقم الشحنة')+amount('fee','أجرة الشركة'):'')+
    (status==='delivered'&&o.ship==='delivery'?amount('collected','المبلغ المحصّل',o.lines.reduce((a,l)=>a+l.net,0)+o.delivery):'')+
    (status==='cancelled'?required('note','سبب الإلغاء'):''),
    'orderStatus',{fixed:{id:o.id,status}});
  const refund=l=>form('إرجاع أو استبدال '+esc(itemName(l.item)),amount('refund','المبلغ المسترد',l.net)+amount('shipping','تكلفة شحن المرتجع')+select('replacement','قطعة بديلة تباع بوصل مستقل',options(s.items.filter(i=>i.status==='available'),i=>itemName(i.id)),true)+pay()+required('note','سبب الإرجاع أو الاستبدال'),'return',{fixed:{id:o.id,item:l.item}});
  modal('طلب '+orderName(o.id),'<div class="stack"><p>'+pill(o.status)+' · '+esc(c?.name||'بيع محل')+' · '+esc(c?.phone)+'</p><p>'+esc([c?.province,c?.area,c?.address,o.carrier,o.tracking].filter(Boolean).join(' · '))+'</p>'+
    (finance()?'<p>الدفع '+({paid:'مدفوع',partial:'جزئي',unpaid:'غير مدفوع'}[o.payment])+' · المحصّل '+money(o.collected)+(o.ship==='delivery'?' · عند الشركة '+money(o.collected-o.paidOut):'')+'</p>':'')+
    table('orderLines',['القطعة','السعر','الجلسة',''],o.lines.map(l=>[esc(itemName(l.item)),money(l.net),esc(pick('streams',l.stream)?.name||'—'),l.returned?'راجعة':owner()&&['delivered','partial'].includes(o.status)?btn('إرجاع / استبدال',()=>refund(l)):'']))+
    '<div class="actions">'+btn('رسالة التأكيد',()=>confirmation(o))+btn('وصل',()=>receipt(o))+btn('قائمة تجهيز',()=>receipt(o,'packing'))+(o.ship==='delivery'?btn('ملصق طرد',()=>receipt(o,'parcel')):'')+'</div>'+
    '<div class="actions">'+(permitted('pack')?next.map(status=>btn(esc(statuses[status]),()=>update(status),status==='cancelled'?'danger':'primary')).join(''):'')+'</div></div>');
}
function orders(){
  const rows=s.orders.filter(o=>!orderFilter||o.status===orderFilter);
  return heading('الطلبات','التأكيد والتجهيز والتسليم والمرتجعات',owner()?btn('بيع سريع داخل المحل',quick,'primary'):'')+
    '<div class="toolbar"><label>الحالة<select id="orderFilter"><option value="">كل الطلبات</option>'+['pending','confirmed','packing','ready','sent','delivered','cancelled','partial','returned'].map(k=>'<option value="'+k+'" '+(orderFilter===k?'selected':'')+'>'+esc(statuses[k])+'</option>').join('')+'</select></label></div>'+
    section('سجل الطلبات',table('orders',['الطلب','الزبون','الحالة','التسليم','المجموع',''],newest(rows).map(o=>[orderName(o.id),esc(pick('customers',o.customer)?.name||'بيع محل'),pill(o.status),o.ship==='delivery'?'توصيل':'المحل',money(o.lines.reduce((a,l)=>a+l.net,0)+o.delivery),btn('فتح',()=>orderDetails(o))])));
}
function customerPage(){
  return heading('الزبائن','الملفات وسجل الطلبات',permitted('live')?btn('زبون جديد',()=>editCustomer(),'primary'):'')+
  section('الزبائن',table('customers',['الاسم','الهاتف','الحساب','المحافظة',''],s.customers.map(c=>[esc(c.name),esc(c.phone),esc([c.platform,c.account].filter(Boolean).join(' · ')),esc(c.province),btn('ملف الزبون',()=>customerDetail(c))])));
}
function customerDetail(c){
  modal(esc(c.name),'<p>'+esc([c.phone,c.platform,c.account,c.province,c.area,c.address,c.note].filter(Boolean).join(' · '))+'</p>'+
    table('customerOrders',['الطلب','الحالة','التاريخ',''],s.orders.filter(o=>o.customer===c.id).map(o=>[orderName(o.id),pill(o.status),esc(when(o.at)),btn('فتح',()=>orderDetails(o))]))+
    (permitted('live')?btn('تعديل',()=>editCustomer(c)):''));
}
function financePage(){
  const r=report(s);
  const move=()=>form('حركة مالية',select('kind','النوع',[['expense','مصروف تشغيل'],['withdraw','سحب مالك'],['capital','إيداع رأس مال']])+amount('amount','المبلغ')+pay()+required('note','البيان'),'money');
  const close=()=>form('إغلاق الصندوق اليومي','<p class="wide">المحسوب '+money(r.cash)+'</p>'+amount('actual','النقد الفعلي')+f('note','سبب الفرق','area','',{wide:true}),'closeCash');
  const payout=o=>form('تسوية '+orderName(o.id),'<p class="wide">الرصيد '+money(o.collected-o.paidOut)+'</p>'+required('reference','مرجع الحوالة')+amount('amount','المبلغ المستلم')+amount('withheld','الأجرة المقتطعة من أجرة الشحنة المسجلة')+amount('charges','اقتطاع إضافي غير مسجل في أجرة الشحنة')+amount('difference','فرق يُشطب من الرصيد')+pay()+f('note','سبب الفرق','area','',{wide:true}),'payout',{fixed:{id:o.id}});
  return heading('المالية','الصندوق والتوصيل والموردون',btn('إغلاق الصندوق',close)+btn('حركة مالية',move,'primary'))+
    section('مستحقات شركات التوصيل',table('due',['الطلب','الشركة','الشحنة','المحصّل','المسوّى','المتبقي',''],r.outstanding.map(o=>[orderName(o.id),esc(o.carrier),esc(o.tracking),money(o.collected),money(o.paidOut),money(o.collected-o.paidOut),o.collected>o.paidOut?btn('تسوية',()=>payout(o)):'✓'])))+
    section('حوالات التوصيل',table('payouts',['الطلب','الشركة','المرجع','المستلم','أجرة الشحنة','الاقتطاع الإضافي','الفرق'],newest(s.settlements).map(p=>[orderName(p.order),esc(p.carrier),esc(p.reference),money(p.amount),money(p.withheld||0),money(p.charges),money(p.difference)])))+
    section('الحركات المالية',table('money',['الحركة','المبلغ','الطريقة','التاريخ','البيان'],newest(s.money).map(m=>[moneyLabels[m.kind],m.kind==='close'?'فرق '+money(m.actual-m.expected):money(m.amount),m.method==='cash'?'نقد':'تحويل',esc(when(m.at)),esc(m.note)])));
}
const metricLabels={net:'صافي الربح',sales:'مبيعات البضاعة المسلّمة',received:'النقد والتحويلات المستلمة',inventory:'المخزون بالتكلفة',due:'لدى شركات التوصيل',cost:'تكلفة البضاعة المباعة',gross:'مجمل ربح البضاعة',delivery:'إيراد التوصيل',fees:'أجور التوصيل',returnFees:'شحن المرتجعات',expenses:'مصاريف التشغيل',deductions:'اقتطاعات وفروقات التوصيل',cash:'النقد المتوفر',transfers:'صافي التحويلات',sent:'قيد التوصيل بالتكلفة',suppliers:'ديون الموردين'};
function detailMetric(k,r){
  let body;
  if(['inventory'].includes(k))body=table('metricstock',['القطعة','التكلفة'],r.stock.map(i=>[esc(itemName(i.id)),money(i.cost+i.repair)]));
  else if(['due','sent'].includes(k))body=table('metricorders',['الطلب','الشحنة','المبلغ'],(k==='due'?r.outstanding:r.sentOrders).map(o=>[btn(orderName(o.id),()=>orderDetails(o)),esc(o.tracking),money(k==='due'?o.collected-o.paidOut:o.lines.reduce((a,l)=>a+l.cost,0))]));
  else if(k==='suppliers')body=table('metricsup',['الدفعة','المورد','المتبقي'],s.batches.map(b=>[esc(b.name),esc(pick('suppliers',b.supplier)?.name),money(b.purchase+b.shipping-b.paid)]));
  else if(['cash','transfers','received','expenses'].includes(k)){
    const rows=k==='cash'?s.money.filter(m=>m.method==='cash'):k==='transfers'?s.money.filter(m=>m.method==='transfer'):r.moves.filter(m=>k==='received'?['sale','payout'].includes(m.kind):m.kind==='expense');
    body=table('metricmoves',['الحركة','التاريخ','المبلغ'],rows.map(m=>[moneyLabels[m.kind],esc(when(m.at)),money(m.amount)]));
  }else if(k==='deductions')body=table('metricdeductions',['المرجع','الاقتطاعات','الفروقات'],r.payouts.map(p=>[esc(p.reference),money(p.charges),money(p.difference)]));
  else if(k==='returnFees')body=returnTable(r.returns);
  else if(k==='delivery'||k==='fees')body=table('metricship',['الطلب','التوصيل','الأجرة'],r.shipOrders.map(o=>[btn(orderName(o.id),()=>orderDetails(o)),money(o.delivery),money(o.fee)]));
  else body=table('metriclines',['الطلب','القطعة','البيع','التكلفة'],r.lines.map(l=>['#'+fmt(l.order),esc(itemName(l.item)),money(l.net),money(l.cost)]))+returnTable(r.returns)+(k==='net'?'<div class="toolbar">'+['delivery','fees','returnFees','expenses','deductions'].map(x=>btn(metricLabels[x]+' '+money(r[x]),()=>detailMetric(x,r))).join('')+'</div>':'');
  modal(metricLabels[k]+' · '+money(r[k]),body);
}
const metrics=(keys,r)=>'<div class="grid">'+keys.map((k,j)=>btn(icon(['◈','▤','◉','▦','◇'][j%5])+'<span>'+metricLabels[k]+'</span><strong class="number">'+money(r[k])+'</strong>',()=>detailMetric(k,r),'metric card')).join('')+'</div>';
const returnTable=rows=>table('returns',['الطلب','القطعة','التاريخ','السبب','المسترد','الشحن'],rows.map(r=>[orderName(r.order),esc(itemName(r.item)),esc(when(r.at)),esc(r.note),money(r.refund),money(r.shipping)]));
function home(){
  const r=report(s,{from:day().slice(0,7)+'-01',to:day()});
  const tasks=[['بانتظار التأكيد','◷',s.orders.filter(o=>o.status==='pending').length,()=>{orderFilter='pending';go('orders')}],['بانتظار التجهيز','□',s.orders.filter(o=>['confirmed','packing'].includes(o.status)).length,()=>{orderFilter='';go('orders')}],['مرتجعات تحتاج فحصاً','↶',s.items.filter(i=>i.status==='inspection'&&i.returnedAt).length,()=>{stockFilter='returnedInspection';go('invent')}],['حجوزات تحتاج مراجعة','◷',s.holds.filter(holdExpiry).length,()=>go('live')]];
  return heading('الرئيسية',finance()?'ملخص الشهر الحالي بتوقيت بغداد':'متابعة المتجر',owner()?btn('إضافة بضاعة',()=>itemEditor())+btn('بيع سريع',quick,'primary'):'')+
    (finance()?metrics(['net','sales','received','inventory','due'],r):'')+
    '<div class="grid two">'+section('تحتاج متابعة',tasks.map(([title,symbol,count,fn])=>btn(icon(symbol)+'<span>'+title+'</span><strong>'+fmt(count)+'</strong>',fn,'taskrow')).join(''))+
    section('آخر الطلبات',table('recent',['الطلب','الزبون','الحالة',''],newest(s.orders).slice(0,5).map(o=>[orderName(o.id),esc(pick('customers',o.customer)?.name||'بيع محل'),pill(o.status),btn('فتح',()=>orderDetails(o))]),'ستظهر الطلبات هنا بعد تسجيلها'))+'</div>';
}
function excel(reportData){
  const cells=rows=>rows.map(row=>'<Row>'+row.map(value=>'<Cell><Data ss:Type="'+(typeof value==='number'?'Number':'String')+'">'+esc(typeof value==='string'?value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,''):value)+'</Data></Cell>').join('')+'</Row>').join('');
  const sheet=(name,rows)=>'<Worksheet ss:Name="'+name+'" ss:RightToLeft="1"><Table>'+cells(rows)+'</Table></Worksheet>';
  const r=reportData;
  const content='<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'+
    sheet('الملخص',[['المؤشر','الدينار العراقي'],...Object.entries(metricLabels).map(([k,v])=>[v,r[k]]),['الإلغاءات',r.cancellations.length],['المرتجعات',r.returns.length],['القطع الراكدة',r.stale.length]])+
    sheet('المبيعات',[['الطلب','القطعة','تاريخ التسليم','صافي البند','التكلفة'],...r.lines.map(l=>[l.order,itemName(l.item),day(l.date),l.net,l.cost])])+
    sheet('المرتجعات',[['الطلب','القطعة','التاريخ','المسترد','الشحن'],...r.returns.map(x=>[orderName(x.order),itemName(x.item),day(x.at),x.refund,x.shipping])])+'</Workbook>';
  save('abu-ali-report-'+day()+'.xml',content,'application/vnd.ms-excel');
}
function reports(){
  const r=report(s,filter);
  const filters='<form id="reportFilter" class="reportForm">'+f('from','من','date',filter.from)+f('to','إلى','date',filter.to)+select('stream','البث',options(s.streams),true,filter.stream)+select('batch','الدفعة',options(s.batches),true,filter.batch)+select('supplier','المورد',options(s.suppliers),true,filter.supplier)+select('category','التصنيف',[...new Set(s.items.map(i=>i.category).filter(Boolean))].map(v=>[v,v]),true,filter.category)+select('carrier','التوصيل',[...new Set(s.orders.map(o=>o.carrier).filter(Boolean))].map(v=>[v,v]),true,filter.carrier)+'<button type="submit" class="primary">تطبيق</button></form>';
  const lines=table('salesReport',['الطلب','القطعة','تاريخ التسليم','صافي البند','التكلفة'],r.lines.map(l=>['#'+fmt(l.order),esc(itemName(l.item)),esc(when(l.date)),money(l.net),money(l.cost)]));
  return heading('التقارير','المبيعات والربح حسب تاريخ التسليم والمرتجعات حسب تاريخ تسجيلها',btn('تصدير Excel',()=>excel(r))+btn('معاينة التقرير',()=>printView('تقرير '+[filter.from,filter.to].filter(Boolean).join(' — '),table('printReport',['المؤشر','القيمة'],Object.entries(metricLabels).map(([k,v])=>[v,money(r[k])]))+lines+returnTable(r.returns)) ))+
    filters+metrics(Object.keys(metricLabels),r)+section('بنود المبيعات',lines)+section('المرتجعات',returnTable(r.returns))+
    section('الإلغاءات',table('cancelReport',['الطلب','الزبون',''],r.cancellations.map(o=>[orderName(o.id),esc(pick('customers',o.customer)?.name),btn('فتح',()=>orderDetails(o))])))+
    section('القطع الراكدة أكثر من ٩٠ يوماً',table('stale',['القطعة','التكلفة','الاستلام'],r.stale.map(i=>[esc(itemName(i.id)),money(i.cost+i.repair),esc(when(i.at))])));
}


function settingsPage(){
  const edit=()=>form('بيانات المتجر',required('name','اسم المحل',s.settings.name)+f('phone','الهاتف','tel',s.settings.phone)+f('address','العنوان','text',s.settings.address)+amount('minutes','مهلة الحجز بالدقائق',s.settings.minutes)+f('logo','شعار المحل','file'),'settings');
  const exportBackup=async()=>{
    if(!owner()){toast('صلاحية المالك مطلوبة');return}
    if(mode==='shared'&&!connected){toast('اتصل بالخادم لتصدير نسخة حديثة');return}
    try{
      const source=mode==='shared'?await api('state',session.token):await access(db,'data');
      save('abu-ali-'+day()+'.json',await backup(source));
      localStorage.setItem('aa-backup-'+mode,new Date().toISOString());render();toast('بدأ تنزيل النسخة');
    }catch(e){toast(e.message)}
  };
  const restore=()=>{
    modal('فحص النسخة الاحتياطية','<div class="form-grid"><label class="wide">ملف JSON<input type="file" accept=".json,application/json"></label></div><p class="error" role="alert"></p>');
    dialog.querySelector('input').addEventListener('change',async e=>{
      try{
        const incoming=await unpack(await e.target.files[0].text());
        const confirmRestore=async()=>{
          if(busy)return;
          busy=true;
          try{
            if(!canWrite())throw Error('اتصل بالخادم أولاً');
            const current=mode==='shared'?await api('state',session.token):await access(db,'data');
            save('abu-ali-before-restore-'+day()+'.json',await backup(current));
            if(mode==='shared'){s=await api('restore',session.token,incoming);await saveCache().catch(()=>{})}
            else s=await access(db,'data',()=>incoming);
            localStorage.setItem('aa-backup-'+mode,new Date().toISOString());
            dialog.close();render();toast('تمت الاستعادة');
          }catch(err){toast(err.message)}
          finally{busy=false}
        };
        modal('معاينة الاستعادة','<p class="notice">سيتم تنزيل نسخة من السجلات الحالية قبل استبدالها.</p><p>'+esc(incoming.settings.name)+' · '+fmt(incoming.items.length)+' قطعة · '+fmt(incoming.orders.length)+' طلب · '+fmt(incoming.items.reduce((n,i)=>n+i.photos.length,0))+' صورة</p><div class="toolbar">'+btn('تنزيل النسخة الحالية واستعادة الملف',confirmRestore,'primary')+'</div>');
      }catch(err){dialog.querySelector('.error').textContent=err.message}
    });
  };
  const account=()=>form('إضافة حساب أو تغيير كلمة مروره',required('name','اسم الدخول')+select('role','الصلاحية',Object.entries(roles))+f('pass','كلمة المرور، ١٠ محارف على الأقل','password','',{required:true}),async p=>{await api('users',session.token,p)});
  const modeButtons='<div class="toolbar">'+btn('اختيار وضع التشغيل',()=>{modal('وضع التشغيل','<p>لكل وضع مساحة بيانات مستقلة. انقل البيانات من خلال النسخ الاحتياطي والاستعادة.</p><div class="toolbar">'+btn('عرض خيارات التشغيل',()=>{dialog.close();localStorage.removeItem('aa-mode');location.reload()},'primary')+'</div>')})+(mode==='shared'?btn('تسجيل خروج',logout):'')+'</div>';
  return heading('المزيد','إعدادات المتجر والجهاز')+
    section('أقسام المتجر','<div class="toolbar">'+[['purchases','المشتريات'],['customers','الزبائن'],['finance','المالية'],['reports','التقارير'],['audit','سجل التدقيق']].filter(([key])=>finance()||key==='customers').map(([key,label])=>btn(label,()=>go(key))).join('')+'</div>')+
    section('هوية المتجر','<p>'+esc(s.settings.name)+' · '+esc(s.settings.phone)+' · '+esc(s.settings.address)+'</p><div class="toolbar">'+(owner()?btn('تعديل الهوية والمهلة',edit,'primary'):'')+btn('تبديل الوضع الداكن',toggleDark)+btn('تثبيت التطبيق',install)+'</div>')+
    section('وضع التشغيل','<p>'+({local:'جهاز واحد · IndexedDB',shared:'واي فاي المحل · SQLite على الخادم',demo:'بيانات تجريبية منفصلة'}[mode])+'</p>'+modeButtons+(mode==='shared'&&owner()?btn('إدارة حساب',account):''))+
    (owner()?section('النسخ الاحتياطي','<p>آخر تنزيل '+esc(when(localStorage.getItem('aa-backup-'+mode)))+'</p><div class="toolbar">'+btn('تصدير نسخة كاملة',exportBackup,'primary')+btn('فحص ملف واستعادة',restore)+'</div>'):'');
}
function auditPage(){
  const auditNames={item:'تسجيل أو تعديل قطعة',orderStatus:'حالة طلب',supplierPayment:'دفعة مورد',allocate:'توزيع تكلفة',money:'حركة مالية',hold:'حجز',return:'مرتجع',count:'جرد',inspect:'فحص',payout:'تسوية',restore:'استعادة'};
  return heading('سجل التدقيق','حركات المخزون والطلبات والمالية')+section('آخر التعديلات',table('audit',['العملية','الموظف','التاريخ','السبب',''],newest(s.audit).map(a=>[esc(auditNames[a.type]||a.type),esc(a.by),esc(when(a.at)),esc(a.note),btn('تفاصيل',()=>modal('تفاصيل الحركة','<p>'+esc(a.ref)+'</p><pre class="table-scroll">'+esc(JSON.stringify(a.values||{},null,2))+'</pre>'))])));
}
function searchPage(q){
  const k=normalize(q),phone=normalize(q).replace(/\D/g,'');
  const like=v=>normalize(v).includes(k);
  const phoneLike=v=>Boolean(phone&&/^[+\d\s()-]+$/.test(normalize(q))&&normalize(v).replace(/\D/g,'').includes(phone));
  const items=s.items.filter(i=>[i.code,i.barcode,i.name].some(like));
  const people=s.customers.filter(c=>like(c.name)||like(c.account)||like(c.phone)||phoneLike(c.phone));
  const orders=s.orders.filter(o=>like('#'+o.no)||people.some(c=>c.id===o.customer));
  return heading('نتائج البحث')+
    section('البضاعة',table('searchItems',['الكود','القطعة','الباركود','الحالة',''],items.map(i=>[esc(i.code),esc(i.name),esc(i.barcode),pill(i.status),btn('فتح',()=>itemDetails(i))])))+
    section('الزبائن',table('searchCustomers',['الاسم','الهاتف',''],people.map(c=>[esc(c.name),esc(c.phone),btn('فتح',()=>customerDetail(c))])))+
    section('الطلبات',table('searchOrders',['الطلب','الحالة',''],orders.map(o=>[orderName(o.id),pill(o.status),btn('فتح',()=>orderDetails(o))])));
}
const pages={home,invent:inventory,live:streamPage,orders,more:settingsPage,purchases,customers:customerPage,finance:financePage,reports,audit:auditPage};
const nav=[['home','الرئيسية','⌂'],['invent','البضاعة','▦'],['live','البث','◉'],['orders','الطلبات','▤'],['more','المزيد','⋯'],['purchases','المشتريات','▣'],['customers','الزبائن','♙'],['finance','المالية','◇'],['reports','التقارير','▥']];
function renderTop(){
  const modeMessage=mode==='shared'?(connected?'متصل بخادم المحل':'الخادم غير متصل · قراءة فقط'):offlineReady?'جاهز للعمل بدون إنترنت':'تهيئة ملفات العمل دون إنترنت';
  $('top').innerHTML='<div class="topline"><span class="statusline '+(mode==='shared'&&!connected?'offline':'')+'">'+esc(modeMessage)+'</span>'+(mode==='demo'?'<span class="pill">تجريبي</span>':'')+'</div><input id="search" type="search" aria-label="بحث سريع" placeholder="بحث بالقطعة أو الطلب أو الهاتف" value="'+esc(query)+'">';
  $('search').addEventListener('input',e=>{query=e.target.value;renderContent()});
}
function renderContent(){
  handlers.forEach((fn,id)=>{if(main.querySelector('[data-action="'+id+'"]'))handlers.delete(id)});
  main.innerHTML=(mode==='shared'&&!connected?'<p class="notice">آخر نسخة متاحة للقراءة. يتطلب الحجز والبيع اتصالاً بالخادم.</p>':'')+
    (query.trim()?searchPage(query):(['finance','reports','audit','purchases'].includes(page)&&!finance()?'<p class="notice">تحتاج صلاحية مالية.</p>':pages[page]()));
  $('fastHold')?.addEventListener('submit',e=>{
    e.preventDefault();
    const selected=pick('streams',selectedStream)||s.streams.at(-1),no=Number(normalize(new FormData(e.target).get('slot'))),slot=selected?.slots.find(x=>x.no===no);
    const error=e.target.querySelector('.error');
    if(!slot){error.textContent='رقم العرض غير موجود في هذه الجلسة';return}
    const held=s.holds.find(h=>h.item===slot.item&&h.status==='reserved');
    const row=main.querySelector('[data-slot="'+slot.no+'"]');
    if(held)toast('محجوزة لدى '+held.account+' · يمكن إضافة انتظار');
    if(row)row.click();else error.textContent='القطعة غير متاحة للحجز';
  });
  $('chooseStream')?.addEventListener('change',e=>{selectedStream=e.target.value;render()});
  $('orderFilter')?.addEventListener('change',e=>{orderFilter=e.target.value;render()});
  $('reportFilter')?.addEventListener('submit',e=>{e.preventDefault();const next=Object.fromEntries(new FormData(e.target));if(next.from&&next.to&&next.from>next.to){toast('تاريخ البداية بعد تاريخ النهاية');return}filter=next;render()});
}
function render(){
  if(!mode||(mode==='shared'&&!session)||!db){renderSetup();return}
  if(!dialog.open)handlers.clear();
  document.title=s.settings.name;
  const entry=([key,label,symbol])=>btn(icon(symbol)+'<span>'+label+'</span>',()=>go(key),page===key?'active':'');
  $('sidebar').innerHTML=brand()+'<nav aria-label="أقسام المتجر">'+nav.filter(([key])=>finance()||!['purchases','finance','reports'].includes(key)).map(entry).join('')+'</nav>';
  $('bottom').innerHTML=nav.slice(0,5).map(entry).join('');
  renderTop();renderContent();
}
function renderSetup(){
  for(const id of ['sidebar','bottom','top'])$(id).innerHTML='';
  if(!dialog.open)handlers.clear();
  const connect=()=>form('الدخول لخادم المحل',required('name','اسم الدخول','owner')+f('pass','كلمة المرور','password','',{required:true}),async p=>{
    const auth=await api('login',null,p);
    const next=await api('state',auth.token);
    session=auth;sessionStorage.setItem('aa-session',JSON.stringify(auth));s=next;connected=true;await saveCache().catch(()=>{});
  });
  main.innerHTML='<div class="setup card stack">'+brand()+'<h1>'+(mode==='shared'?'دخول واي فاي المحل':'اختيار وضع التشغيل')+'</h1>'+
    (mode==='shared'?'<p>افتح التطبيق من عنوان كمبيوتر المحل. حساب المالك يبدأ باسم owner.</p><div class="actions">'+btn('تسجيل الدخول',connect,'primary')+btn('تغيير الوضع',()=>choose(''))+'</div>':
    '<p>اختر مكان حفظ بيانات المتجر.</p><div class="stack">'+btn('جهاز واحد · حفظ على هذا الجهاز',()=>choose('local'),'primary')+btn('واي فاي المحل · قاعدة مشتركة',()=>choose('shared'))+btn('تجربة في مساحة منفصلة',()=>choose('demo'))+'</div>')+
    (setupError?'<p class="error" role="alert">'+esc(setupError)+'</p>':'')+'</div>';
}
async function choose(value){
  if(value==='shared'){
    try{const info=await api('info');if(!info.shared)throw Error('افتح عنوان خادم المحل المشغّل بخيار الوضع المشترك.');if(!isSecureContext)throw Error('افتح عنوان HTTPS الموثوق لخادم المحل، أو localhost على الكمبيوتر.')}
    catch(e){setupError=e.message;renderSetup();return}
  }
  if(value)localStorage.setItem('aa-mode',value);else localStorage.removeItem('aa-mode');
  location.reload();
}
async function saveCache(){if(cache&&session)await access(cache,'user:'+session.name,()=>({role:session.role,state:s}))}
async function logout(){
  if(connected)await api('logout',session.token,{}).catch(()=>{});
  if(cache&&session)await access(cache,'user:'+session.name,()=>null).catch(()=>{});
  sessionStorage.removeItem('aa-session');location.reload();
}
async function refresh(){
  if(mode!=='shared'||!session||busy)return;
  const auth=session,previous=connected;
  try{
    const data=await api('state',auth.token);
    if(busy||auth!==session)return;
    const changed=JSON.stringify(s.audit.at(-1))!==JSON.stringify(data.audit.at(-1))||(!finance()&&JSON.stringify(data)!==JSON.stringify(s));
    s=data;connected=true;await saveCache().catch(()=>{});
    if((changed||!previous)&&!dialog.open)render();
  }catch(e){
    if(e.status===401){if(cache)await access(cache,'user:'+auth.name,()=>null).catch(()=>{});session=null;s=empty();connected=false;sessionStorage.removeItem('aa-session');if(dialog.open)dialog.close();render()}
    else if(previous){connected=false;if(!dialog.open)render();else renderTop()}
  }
}
function toggleDark(){const dark=document.documentElement.classList.toggle('dark');localStorage.setItem('aa-dark',dark?'1':'0')}
async function install(){
  if(promptInstall){await promptInstall.prompt();promptInstall=null;return}
  const ios=/iPad|iPhone|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const installed=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  modal('تثبيت التطبيق','<p class="notice">'+(installed?'التطبيق مفتوح في وضع مستقل.':ios?'في Safari افتح المشاركة ثم اختر إضافة إلى الشاشة الرئيسية.':/Android/i.test(navigator.userAgent)?'افتح قائمة المتصفح واختر تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية.':'في Chrome أو Edge ابحث عن أيقونة التثبيت في شريط العنوان أو عن التطبيقات في قائمة المتصفح.')+'</p>');
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptInstall=e});
document.addEventListener('click',e=>{
  const target=e.target.closest('[data-action]');if(!target)return;
  const fn=handlers.get(target.dataset.action);if(fn)Promise.resolve().then(fn).catch(e=>toast(e.message));
});
if(localStorage.getItem('aa-dark')==='1')document.documentElement.classList.add('dark');
async function start(){
  if(mode==='shared'){
    cache=await openDb('abu-ali-shared-cache');
    db=cache;
    try{session=JSON.parse(sessionStorage.getItem('aa-session')||'null')}catch{}
    if(session){
      const old=await access(cache,'user:'+session.name);
      if(old?.role===session.role)s=old.state;
      await refresh();
    }
    setInterval(refresh,5500);
    window.addEventListener('online',refresh);
  }else if(mode){
    db=await openDb(mode==='demo'?'abu-ali-demo':'abu-ali-local');
    s=await initialize(db);
    if(mode==='demo'&&!s.audit.length){
      await access(db,'data',old=>{
        if(old.audit.length)return old;
        return seedDemo(old);
      });
      s=await access(db,'data');
    }
  }
  render();
  if('serviceWorker' in navigator){
    try{
      await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
      offlineReady=true;
      if(mode&&db&&(mode!=='shared'||session))renderTop();
    }catch{if(mode==='local'||mode==='demo')toast('تعذر تجهيز ملفات العمل بدون إنترنت')}
  }
}
import {apply} from './core.mjs';
function seedDemo(data){
  let d=data;
  const add=(t,p)=>{d=apply(d,t,p)};
  add('supplier',{name:'المورد التجريبي'});
  add('batch',{name:'دفعة تدريب',supplier:d.suppliers[0].id,date:day(),purchase:300000,shipping:0,paid:0});
  for(const [code,name,price] of [['AA-01','ماكينة قهوة',165000],['AA-02','سماعات لاسلكية',115000],['AA-03','مصباح مكتبي',95000]]){
    add('item',{code,name,price,batch:d.batches[0].id,category:'أجهزة',location:'رف ١'});add('inspect',{id:d.items.at(-1).id,status:'available'});
  }
  add('allocate',{id:d.batches[0].id,mode:'equal',note:'تكلفة تدريب'});
  add('stream',{name:'بث تجريبي',date:day(),items:d.items.map(i=>i.id)});
  return d;
}
start().catch(e=>{setupError=e.message;renderSetup()});

