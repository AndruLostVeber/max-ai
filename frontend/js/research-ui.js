(function(){
  const HIDDEN_TABLE_IDS = new Set([
    'general-evidence-map',
    'general-source-coverage',
    'comparison-evidence-map',
    'time-series-deliverables',
  ]);

  const RU_RE = /[\u0400-\u04FF]/;
  const VERDICT_PREFIX_RE = /^(verdict|итог|вердикт)\s*:\s*/i;
  const METRIC_PRIORITY = ['percent_change', 'absolute_change', 'end_price', 'start_price', 'high', 'low'];

  function isRussianText(text){
    return RU_RE.test(String(text || ''));
  }

  function cleanResearchLine(text){
    return String(text || '')
      .replace(/\s+/g, ' ')
      .replace(/\s*\[[A-Z]\d[^\]]*\]([.!?])?\s*$/, '$1')
      .replace(/`/g, '')
      .trim();
  }

  function getLabels(isRu){
    return isRu
      ? {
          title: '\u0420\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0438\u0441\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u043d\u0438\u044f',
          verdict: '\u0412\u044b\u0432\u043e\u0434',
          takeaways: '\u041a\u043b\u044e\u0447\u0435\u0432\u044b\u0435 \u0432\u044b\u0432\u043e\u0434\u044b',
          numbers: '\u041a\u043b\u044e\u0447\u0435\u0432\u044b\u0435 \u0446\u0438\u0444\u0440\u044b',
          table: '\u0421\u0432\u043e\u0434\u043d\u0430\u044f \u0442\u0430\u0431\u043b\u0438\u0446\u0430',
          sources: '\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438',
          limitations: '\u0427\u0442\u043e \u0432\u0430\u0436\u043d\u043e \u0443\u0447\u0435\u0441\u0442\u044c',
        }
      : {
          title: 'Research result',
          verdict: 'Bottom line',
          takeaways: 'Key takeaways',
          numbers: 'Key numbers',
          table: 'Summary table',
          sources: 'Sources',
          limitations: 'What to keep in mind',
        };
  }

  function formatMetricName(name){
    if(typeof formatResearchMetricName === 'function'){
      return formatResearchMetricName(name || '');
    }
    return String(name || '').replace(/_/g, ' ').trim();
  }

  function formatMetricValue(metric){
    const value = String(metric?.value || '').trim();
    const unit = String(metric?.unit || '').trim();
    if(!value) return '-';
    return unit && !value.includes(unit) ? `${value} ${unit}` : value;
  }

  function dedupeStrings(items, limit){
    const seen = new Set();
    const result = [];
    (Array.isArray(items) ? items : []).forEach(item => {
      const cleaned = cleanResearchLine(item);
      if(!cleaned) return;
      const key = cleaned.toLowerCase();
      if(seen.has(key)) return;
      seen.add(key);
      result.push(cleaned);
    });
    return typeof limit === 'number' ? result.slice(0, limit) : result;
  }

  function pickPrimaryTable(tables){
    const visible = (Array.isArray(tables) ? tables : [])
      .filter(table => Array.isArray(table?.rows) && table.rows.length && !HIDDEN_TABLE_IDS.has(table.table_id));
    if(!visible.length) return null;
    return [...visible].sort((left, right) => {
      const leftRank = left.table_id === 'time-series-summary'
        ? 0
        : left.table_id === 'comparison-summary'
          ? 1
          : /summary|свод/i.test(String(left.title || ''))
            ? 2
            : 3;
      const rightRank = right.table_id === 'time-series-summary'
        ? 0
        : right.table_id === 'comparison-summary'
          ? 1
          : /summary|свод/i.test(String(right.title || ''))
            ? 2
            : 3;
      return leftRank - rightRank;
    })[0];
  }

  function pickPrimaryMetrics(metrics){
    const seen = new Set();
    return [...(Array.isArray(metrics) ? metrics : [])]
      .sort((left, right) => {
        const leftRank = METRIC_PRIORITY.indexOf(left?.name || '');
        const rightRank = METRIC_PRIORITY.indexOf(right?.name || '');
        return (leftRank === -1 ? 99 : leftRank) - (rightRank === -1 ? 99 : rightRank);
      })
      .filter(metric => {
        const key = `${String(metric?.entity || '').toLowerCase()}::${String(metric?.name || '').toLowerCase()}`;
        if(seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6);
  }

  function pickPrimarySources(sources){
    const seen = new Set();
    return (Array.isArray(sources) ? sources : [])
      .filter(source => {
        const key = String(source?.url || '').trim().toLowerCase();
        if(!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 4);
  }

  function pickScope(result){
    const scope = [];
    const entities = Array.isArray(result?.intent?.entities) ? result.intent.entities.filter(Boolean) : [];
    if(entities.length) scope.push(entities.slice(0, 4).join(', '));
    if(result?.intent?.comparison_axis) scope.push(String(result.intent.comparison_axis).trim());
    if(result?.intent?.time_range?.label) scope.push(String(result.intent.time_range.label).trim());
    return scope.filter(Boolean).slice(0, 4);
  }

  function splitFindings(findings){
    let verdict = '';
    const takeaways = [];
    dedupeStrings(findings).forEach(item => {
      if(!verdict && VERDICT_PREFIX_RE.test(item)){
        verdict = cleanResearchLine(item.replace(VERDICT_PREFIX_RE, ''));
        return;
      }
      takeaways.push(item);
    });
    return { verdict, takeaways: takeaways.slice(0, 4) };
  }

  function buildFallbackPresentation(result){
    const languageSeed = [
      result?.answer,
      ...(Array.isArray(result?.findings) ? result.findings.slice(0, 2) : []),
    ].join(' ');
    const isRu = isRussianText(languageSeed);
    const labels = getLabels(isRu);
    const { verdict, takeaways } = splitFindings(result?.findings || []);
    const table = pickPrimaryTable(result?.tables);
    const metrics = pickPrimaryMetrics(result?.metrics);
    const sources = pickPrimarySources(result?.sources);
    const limitations = dedupeStrings(result?.uncertainties || [], 3);
    const sections = [];

    if(verdict){
      sections.push({
        section_id: 'verdict',
        kind: 'verdict',
        title: labels.verdict,
        body: verdict,
      });
    }
    if(takeaways.length){
      sections.push({
        section_id: 'takeaways',
        kind: 'takeaways',
        title: labels.takeaways,
        items: takeaways,
      });
    }
    if(table){
      sections.push({
        section_id: 'table',
        kind: 'table',
        title: table.title || labels.table,
        table,
      });
    }
    if(metrics.length){
      sections.push({
        section_id: 'metrics',
        kind: 'metrics',
        title: labels.numbers,
        metrics,
      });
    }
    if(limitations.length){
      sections.push({
        section_id: 'limitations',
        kind: 'limitations',
        title: labels.limitations,
        items: limitations,
      });
    }
    if(sources.length){
      sections.push({
        section_id: 'sources',
        kind: 'sources',
        title: labels.sources,
        sources,
      });
    }

    return {
      title: labels.title,
      summary: cleanResearchLine(result?.answer || takeaways[0] || verdict || ''),
      scope: pickScope(result),
      sections,
    };
  }

  function getPresentation(result){
    const raw = result?.presentation && typeof result.presentation === 'object'
      ? result.presentation
      : buildFallbackPresentation(result);
    return {
      title: cleanResearchLine(raw?.title || ''),
      summary: cleanResearchLine(raw?.summary || result?.answer || ''),
      scope: (Array.isArray(raw?.scope) ? raw.scope : []).map(cleanResearchLine).filter(Boolean).slice(0, 4),
      sections: (Array.isArray(raw?.sections) ? raw.sections : []).filter(Boolean),
    };
  }

  function renderScope(scope){
    if(!Array.isArray(scope) || !scope.length) return null;
    const wrap = document.createElement('div');
    wrap.className = 'research-scope';
    scope.forEach(item => {
      const pill = document.createElement('span');
      pill.className = 'research-pill';
      pill.textContent = item;
      wrap.appendChild(pill);
    });
    return wrap;
  }

  function renderVerdictSection(section){
    const body = cleanResearchLine(section?.body || section?.items?.[0] || '');
    if(!body) return null;
    const panel = document.createElement('div');
    panel.className = 'research-panel research-panel-accent';
    panel.innerHTML = `<div class="research-panel-title">${esc(section.title || 'Bottom line')}</div><div class="research-summary-line">${esc(body)}</div>`;
    return panel;
  }

  function renderTakeawaysSection(section){
    const items = dedupeStrings(section?.items || [], 4);
    if(!items.length) return null;
    const panel = document.createElement('div');
    panel.className = 'research-panel';
    panel.innerHTML = `<div class="research-panel-title">${esc(section.title || 'Key takeaways')}</div>`;
    const list = document.createElement('div');
    list.className = 'research-highlight-list';
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'research-highlight';
      row.textContent = item;
      list.appendChild(row);
    });
    panel.appendChild(list);
    return panel;
  }

  function renderMetricsSection(section){
    const metrics = Array.isArray(section?.metrics) ? section.metrics : [];
    if(!metrics.length) return null;
    const panel = document.createElement('div');
    panel.className = 'research-panel';
    panel.innerHTML = `<div class="research-panel-title">${esc(section.title || 'Key numbers')}</div>`;
    const grid = document.createElement('div');
    grid.className = 'research-metric-grid';
    metrics.forEach(metric => {
      const label = [metric.entity || '', formatMetricName(metric.name || '')]
        .filter(Boolean)
        .join(' • ');
      const card = document.createElement('div');
      card.className = 'research-metric';
      card.innerHTML = `<div class="research-metric-label">${esc(label || 'Metric')}</div><div class="research-metric-value">${esc(formatMetricValue(metric))}</div>`;
      grid.appendChild(card);
    });
    panel.appendChild(grid);
    return panel;
  }

  function renderTableSection(section){
    const table = section?.table;
    if(!table || !Array.isArray(table.rows) || !table.rows.length) return null;
    const panel = document.createElement('div');
    panel.className = 'research-panel';
    panel.innerHTML = `<div class="research-panel-title">${esc(section.title || table.title || 'Table')}</div>`;
    const wrap = document.createElement('div');
    wrap.className = 'research-table-wrap';
    const tableEl = document.createElement('table');
    tableEl.className = 'research-table';

    if(Array.isArray(table.columns) && table.columns.length){
      const head = document.createElement('thead');
      const headRow = document.createElement('tr');
      table.columns.forEach(column => {
        const th = document.createElement('th');
        th.textContent = column;
        headRow.appendChild(th);
      });
      head.appendChild(headRow);
      tableEl.appendChild(head);
    }

    const body = document.createElement('tbody');
    table.rows.slice(0, 6).forEach(row => {
      const tr = document.createElement('tr');
      (Array.isArray(row) ? row : []).forEach(cell => {
        const td = document.createElement('td');
        td.textContent = typeof compactResearchText === 'function'
          ? compactResearchText(cell, 72)
          : String(cell || '');
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    tableEl.appendChild(body);
    wrap.appendChild(tableEl);
    panel.appendChild(wrap);
    return panel;
  }

  function renderSourcesSection(section){
    const sources = pickPrimarySources(section?.sources || []);
    if(!sources.length) return null;
    const panel = document.createElement('div');
    panel.className = 'research-panel';
    panel.innerHTML = `<div class="research-panel-title">${esc(section.title || 'Sources')}</div>`;
    const list = document.createElement('div');
    list.className = 'research-source-list';
    sources.forEach(source => {
      const item = document.createElement('a');
      item.className = 'research-source';
      item.href = source.url || '#';
      item.target = '_blank';
      item.rel = 'noreferrer';
      const title = typeof compactResearchText === 'function'
        ? compactResearchText(source.title || source.url || 'Source', 72)
        : (source.title || source.url || 'Source');
      const snippet = typeof compactResearchText === 'function'
        ? compactResearchText(source.snippet || source.excerpt || '', 110)
        : (source.snippet || source.excerpt || '');
      item.innerHTML = `<div class="research-source-top"><strong>${esc(title)}</strong><span>${esc(source.domain || '')}</span></div><div class="research-source-snippet">${esc(snippet)}</div>`;
      list.appendChild(item);
    });
    panel.appendChild(list);
    return panel;
  }

  function renderLimitationsSection(section){
    const items = dedupeStrings(section?.items || [], 3);
    if(!items.length) return null;
    const panel = document.createElement('div');
    panel.className = 'research-panel';
    panel.innerHTML = `<div class="research-panel-title">${esc(section.title || 'What to keep in mind')}</div>`;
    const list = document.createElement('div');
    list.className = 'research-note-list';
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'research-note';
      row.textContent = item;
      list.appendChild(row);
    });
    panel.appendChild(list);
    return panel;
  }

  function renderSection(section){
    switch(section?.kind){
      case 'verdict':
        return renderVerdictSection(section);
      case 'takeaways':
        return renderTakeawaysSection(section);
      case 'metrics':
        return renderMetricsSection(section);
      case 'table':
        return renderTableSection(section);
      case 'sources':
        return renderSourcesSection(section);
      case 'limitations':
        return renderLimitationsSection(section);
      default:
        return null;
    }
  }

  window.appendRichResearchResult = function(container, session){
    if(!container || !session?.result) return;
    const presentation = getPresentation(session.result);
    const sections = Array.isArray(presentation.sections) ? presentation.sections : [];
    if(!presentation.scope.length && !sections.length) return;

    const wrap = document.createElement('section');
    wrap.className = 'research-card research-card-clean';

    const scope = renderScope(presentation.scope);
    if(scope) wrap.appendChild(scope);

    sections.forEach(section => {
      const node = renderSection(section);
      if(node) wrap.appendChild(node);
    });

    if(wrap.childNodes.length){
      container.appendChild(wrap);
    }
  };
})();
