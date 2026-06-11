(function(){
  var MESSAGE_VERSION = 'BUSINESS_MESSAGES_DISTRIBUTED_V1';

  function todayKey(){
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function daysSinceBase(){
    var base = new Date(2026,0,1);
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.floor((today - base) / 86400000);
  }
  function hash(str){
    var h = 2166136261;
    for(var i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h += (h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24);
    }
    return Math.abs(h >>> 0);
  }
  function parseCsvLine(line){
    var out=[], cur='', q=false;
    for(var i=0;i<line.length;i++){
      var ch=line.charAt(i);
      if(ch==='"'){
        if(q && line.charAt(i+1)==='"'){ cur+='"'; i++; }
        else q=!q;
      } else if(ch===',' && !q){ out.push(cur); cur=''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }
  function escapeHtml(s){
    return String(s||'').replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];});
  }
  function loadCsv(file, callback){
    var xhr = new XMLHttpRequest();
    xhr.open('GET', file + '?v=' + new Date().getTime(), true);
    xhr.overrideMimeType('text/plain; charset=UTF-8');
    xhr.onreadystatechange = function(){
      if(xhr.readyState !== 4) return;
      if(xhr.status !== 200){ callback(new Error(file + ' を取得できません。HTTP=' + xhr.status)); return; }
      try{
        var text = xhr.responseText || '';
        if(text.length > 0 && text.charCodeAt(0) === 65279) text = text.substring(1);
        var lines = text.split(/\r?\n/).filter(function(l){return l.trim() !== '';});
        if(lines.length <= 1){ callback(null, []); return; }
        var header = parseCsvLine(lines[0]).map(function(v){return v.trim().toLowerCase();});
        var idx = {
          id: header.indexOf('id'),
          type: header.indexOf('type'),
          category: header.indexOf('category'),
          title: header.indexOf('title'),
          body: header.indexOf('body'),
          active: header.indexOf('active')
        };
        var rows = [];
        for(var i=1;i<lines.length;i++){
          var c = parseCsvLine(lines[i]);
          var active = idx.active >= 0 ? String(c[idx.active] || 'true').toLowerCase() : 'true';
          if(active === 'false') continue;
          rows.push({
            id: idx.id>=0 ? c[idx.id] : '',
            type: idx.type>=0 ? c[idx.type] : '',
            category: idx.category>=0 ? c[idx.category] : '',
            title: idx.title>=0 ? c[idx.title] : '',
            body: idx.body>=0 ? c[idx.body] : ''
          });
        }
        callback(null, rows);
      }catch(e){ callback(e); }
    };
    xhr.onerror = function(){ callback(new Error(file + ' の通信に失敗しました。')); };
    xhr.send();
  }

  function categoryGroup(category){
    var c = String(category || '');
    if(c.indexOf('メール')>=0 || c.indexOf('情報セキュリティ')>=0 || c.indexOf('個人情報')>=0 || c.indexOf('IT')>=0 || c.indexOf('DX')>=0) return '情報・IT';
    if(c.indexOf('法務')>=0 || c.indexOf('契約')>=0 || c.indexOf('コンプライアンス')>=0 || c.indexOf('ハラスメント')>=0) return '法務・コンプラ';
    if(c.indexOf('労務')>=0 || c.indexOf('勤怠')>=0 || c.indexOf('安全衛生')>=0 || c.indexOf('メンタル')>=0 || c.indexOf('自己管理')>=0) return '労務・健康';
    if(c.indexOf('会計')>=0 || c.indexOf('経費')>=0 || c.indexOf('数字')>=0) return '会計・数字';
    if(c.indexOf('業務改善')>=0 || c.indexOf('品質')>=0 || c.indexOf('資料')>=0) return '業務・品質';
    if(c.indexOf('マネジメント')>=0 || c.indexOf('チーム')>=0 || c.indexOf('会議')>=0 || c.indexOf('コミュニケーション')>=0) return '組織・対話';
    if(c.indexOf('営業')>=0 || c.indexOf('顧客')>=0 || c.indexOf('取引先')>=0 || c.indexOf('マーケ')>=0) return '顧客・取引';
    if(c.indexOf('リスク')>=0) return 'リスク';
    if(c.indexOf('経営')>=0 || c.indexOf('キャリア')>=0) return '経営・成長';
    return c || 'その他';
  }
  function isSimilarCategory(a,b){
    if(!a || !b) return false;
    return a === b || categoryGroup(a) === categoryGroup(b);
  }

  function makeDistributedSequence(rows, salt){
    var groups = {};
    rows.slice().sort(function(a,b){return String(a.id).localeCompare(String(b.id),'ja');}).forEach(function(r){
      var key = r.category || 'その他';
      if(!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    var cats = Object.keys(groups).sort(function(a,b){return (hash(salt+'|'+a) - hash(salt+'|'+b));});
    var seq = [];
    var lastGroup = '';
    while(true){
      var best = null;
      for(var i=0;i<cats.length;i++){
        var cat = cats[i];
        if(groups[cat].length === 0) continue;
        if(best === null){ best = cat; continue; }
        var bestBad = categoryGroup(best) === lastGroup;
        var catBad = categoryGroup(cat) === lastGroup;
        if(bestBad && !catBad) best = cat;
        else if(bestBad === catBad && groups[cat].length > groups[best].length) best = cat;
      }
      if(best === null) break;
      seq.push(groups[best].shift());
      lastGroup = categoryGroup(best);
    }
    return seq;
  }

  function pickFromSequence(seq, offset){
    if(!seq || !seq.length) return null;
    var index = (daysSinceBase() + offset) % seq.length;
    if(index < 0) index += seq.length;
    return seq[index];
  }

  function pickPair(tips, cautions){
    var tipSeq = makeDistributedSequence(tips, 'tips');
    var cautionSeq = makeDistributedSequence(cautions, 'cautions');
    var day = daysSinceBase();
    var tip = pickFromSequence(tipSeq, 0);
    var caution = null;
    if(cautionSeq.length){
      var base = (day * 7 + 13) % cautionSeq.length;
      for(var i=0;i<cautionSeq.length;i++){
        var candidate = cautionSeq[(base + i) % cautionSeq.length];
        if(!tip || !isSimilarCategory(tip.category, candidate.category)){ caution = candidate; break; }
      }
      if(!caution) caution = cautionSeq[base];
    }
    return {tip: tip, caution: caution};
  }

  function render(pair){
    var area = document.querySelector('.business-message-area');
    if(!area) return;
    var tipText = pair.tip ? pair.tip.body : '毎日の学び';
    var cautionText = pair.caution ? pair.caution.body : '実務上の注意喚起';
    area.innerHTML = ''+
      '<div class="business-message-line"><span class="business-message-label">ビジネス豆知識：</span><span>'+escapeHtml(tipText)+'</span></div>'+
      '<div class="business-message-line"><span class="business-message-label">今日の注意：</span><span>'+escapeHtml(cautionText)+'</span></div>';
  }

  var tips = null, cautions = null;
  function maybeRender(){
    if(tips === null || cautions === null) return;
    render(pickPair(tips, cautions));
  }
  loadCsv('business-tips.csv', function(e, rows){ tips = e ? [] : rows; maybeRender(); });
  loadCsv('business-cautions.csv', function(e, rows){ cautions = e ? [] : rows; maybeRender(); });
})();