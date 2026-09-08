export const REPORT_CSS = `
  :root{
    --bg:#EEF1F2; --surface:#FFFFFF; --surface-2:#E3E9EA; --border:#D3DADC;
    --text:#141A1F; --muted:#5B6B72; --faint:#8B979B;
    --accent:#2E6E73; --accent-soft:#DCEAEA; --accent-ink:#123236;
    --success:#3F7D52; --success-soft:#E1EEE4;
    --warning:#B8791E; --warning-soft:#F5E7D2;
    --critical:#A83E2C; --critical-soft:#F3E0DA;
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --bg:#0E1518; --surface:#16212A; --surface-2:#1C2932; --border:#2A3A44;
      --text:#E7ECEC; --muted:#8CA0A8; --faint:#5E7178;
      --accent:#63BDC3; --accent-soft:#1B3236; --accent-ink:#CFEFF1;
      --success:#74CE8C; --success-soft:#1C3323;
      --warning:#E3AD55; --warning-soft:#392C15;
      --critical:#E58067; --critical-soft:#3A2019;
    }
  }
  :root[data-theme="dark"]{
    --bg:#0E1518; --surface:#16212A; --surface-2:#1C2932; --border:#2A3A44;
    --text:#E7ECEC; --muted:#8CA0A8; --faint:#5E7178;
    --accent:#63BDC3; --accent-soft:#1B3236; --accent-ink:#CFEFF1;
    --success:#74CE8C; --success-soft:#1C3323;
    --warning:#E3AD55; --warning-soft:#392C15;
    --critical:#E58067; --critical-soft:#3A2019;
  }
  *{box-sizing:border-box;}
  body{ margin:0; background:var(--bg); color:var(--text); font-family:"IBM Plex Sans",system-ui,sans-serif; font-size:15px; line-height:1.55; }
  h1,h2,h3,.display{ font-family:"Fraunces","IBM Plex Sans",serif; text-wrap:balance; }
  .mono{ font-family:"IBM Plex Mono",ui-monospace,monospace; font-variant-numeric:tabular-nums; }
  .eyebrow{ display:block; text-transform:uppercase; letter-spacing:.08em; font-size:11.5px; font-weight:600; color:var(--muted); margin-bottom:4px; }
  .text-critical{ color:var(--critical); font-weight:600; }
  .meta-row{ display:flex; align-items:center; gap:8px; color:var(--muted); font-size:13px; flex-wrap:wrap; }
  .meta-row span:not(:first-child)::before{ content:"·"; margin-right:8px; color:var(--faint); }
  .meta-row .mono{ color:var(--text); }
  .execution-id{ margin-top:6px; color:var(--faint); font-size:12px; }
  .execution-id .mono{ color:var(--muted); }
  .page{ max-width:1180px; margin:0 auto; padding:36px 28px 64px; }
  .run-head{ display:flex; justify-content:space-between; align-items:flex-end; gap:24px; padding-bottom:20px; border-bottom:1px solid var(--border); margin-bottom:24px; }
  .run-head h1{ font-size:26px; font-weight:650; margin:6px 0 10px; word-break:break-word; }
  .stamp{ display:inline-flex; align-items:center; gap:7px; padding:7px 14px; border-radius:3px; font-size:13px; font-weight:600; white-space:nowrap; border:1px solid transparent; }
  .stamp.success{ background:var(--success-soft); color:var(--success); border-color:color-mix(in srgb, var(--success) 35%, transparent); }
  .stamp.warning{ background:var(--warning-soft); color:var(--warning); border-color:color-mix(in srgb, var(--warning) 35%, transparent); }
  .stamp.critical{ background:var(--critical-soft); color:var(--critical); border-color:color-mix(in srgb, var(--critical) 35%, transparent); }
  .stamp .dot{ width:7px; height:7px; border-radius:50%; background:currentColor; }
  .stats{ display:grid; grid-template-columns:repeat(6,1fr); gap:1px; background:var(--border); border:1px solid var(--border); border-radius:6px; overflow:hidden; margin-bottom:24px; }
  .stat{ background:var(--surface); padding:18px 20px; }
  .stat .n{ font-family:"Fraunces",serif; font-size:34px; font-weight:560; line-height:1; }
  .stat .l{ margin-top:6px; color:var(--muted); font-size:12.5px; }
  .top-tabs{ display:flex; gap:8px; margin-bottom:20px; border-bottom:1px solid var(--border); }
  .top-tab{ font:inherit; font-weight:600; font-size:14px; color:var(--muted); background:none; border:none; border-bottom:2px solid transparent; padding:10px 4px; margin-bottom:-1px; cursor:pointer; }
  .top-tab[aria-current="true"]{ color:var(--accent); border-bottom-color:var(--accent); }
  .coverage-intro{ color:var(--muted); font-size:13.5px; margin:0 0 16px; }
  .safety-detail .safety-examples-label{ margin-top:8px; }
  .safety-detail .runtime-issue{ color:var(--muted); font-size:12.5px; }
  .coverage-groups{ display:flex; flex-direction:column; gap:16px; }
  .cov-group{ background:var(--surface); border:1px solid var(--border); border-radius:6px; overflow:hidden; }
  .cov-group-head{ display:flex; justify-content:space-between; align-items:baseline; gap:12px; padding:12px 18px; border-bottom:1px solid var(--border); }
  .cov-group-head h3{ font-size:15.5px; margin:0; text-transform:capitalize; }
  .cov-table-wrap{ overflow-x:auto; }
  .cov-table{ width:100%; border-collapse:collapse; font-size:13px; }
  .cov-table th{ text-align:left; color:var(--muted); font-weight:600; font-size:11.5px; text-transform:uppercase; letter-spacing:.04em; padding:8px 18px; }
  .cov-table td{ padding:7px 18px; border-top:1px dashed var(--border); vertical-align:top; }
  .board{ display:grid; grid-template-columns:250px 1fr; gap:28px; align-items:start; }
  .case-list{ display:flex; flex-direction:column; gap:8px; position:sticky; top:24px; }
  .case{ text-align:left; width:100%; cursor:pointer; border:1px solid var(--border); background:var(--surface); border-radius:6px; padding:13px 14px; display:flex; flex-direction:column; gap:6px; font:inherit; color:inherit; }
  .case[aria-current="true"]{ border-color:var(--accent); background:var(--accent-soft); }
  .case-top{ display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
  .case-name{ font-family:"Fraunces",serif; font-weight:650; font-size:17px; }
  .intent{ font-size:10.5px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; padding:2px 7px; border-radius:99px; white-space:nowrap; }
  .intent.journey{ background:var(--accent-soft); color:var(--accent-ink); }
  .intent.challenge{ background:var(--warning-soft); color:var(--warning); }
  .case-meta{ font-size:12.5px; }
  .detail{ display:flex; flex-direction:column; gap:22px; min-width:0; }
  .persona-detail{ display:flex; flex-direction:column; gap:16px; }
  .persona-detail[hidden]{ display:none; }
  .brief{ background:var(--surface); border:1px solid var(--border); border-radius:6px; padding:18px 20px; }
  .brief h2{ font-size:19px; margin:0 0 10px; display:flex; align-items:baseline; gap:10px; }
  .brief h2 .intent{ font-family:"IBM Plex Sans",sans-serif; }
  .brief .scope, .brief .expect{ font-size:14px; }
  .brief .expect{ margin-top:12px; font-size:13.5px; color:var(--muted); }
  .brief .expect ol{ margin:0; padding-left:18px; color:var(--text); }
  .flow{ background:var(--surface); border:1px solid var(--border); border-radius:6px; overflow:hidden; }
  .flow-head{ display:flex; justify-content:space-between; align-items:center; gap:12px; padding:14px 18px; border-bottom:1px solid var(--border); }
  .flow-head h3{ font-size:16.5px; margin:0; }
  .flow-summary{ margin:12px 18px; color:var(--muted); font-size:13.5px; }
  .chip-group{ display:flex; gap:6px; }
  .chip{ font-size:11.5px; font-weight:600; padding:3px 10px; border-radius:99px; white-space:nowrap; }
  .chip.success{ background:var(--success-soft); color:var(--success); }
  .chip.warning{ background:var(--warning-soft); color:var(--warning); }
  .chip.critical{ background:var(--critical-soft); color:var(--critical); }
  .chip.muted{ background:var(--surface-2); color:var(--muted); }
  .steps{ list-style:none; margin:0; padding:6px 0; }
  .step{ display:grid; grid-template-columns:30px 1fr; gap:12px; padding:8px 18px; align-items:baseline; }
  .step + .step{ border-top:1px dashed var(--border); }
  .step .idx{ color:var(--faint); text-align:right; font-size:13px; }
  .step .verb{ font-weight:600; }
  .step .target{ color:var(--muted); margin-left:4px; }
  .step-error{ color:var(--critical); font-size:12.5px; margin-top:2px; }
  .step-note{ color:var(--warning); font-size:12.5px; margin-top:2px; }
  .note{ margin:0 18px 12px; padding:9px 12px; border-radius:5px; font-size:13px; }
  #view-coverage .note{ margin-left:0; margin-right:0; }
  .note.warning{ background:var(--warning-soft); color:var(--warning); }
  .note.critical{ background:var(--critical-soft); color:var(--critical); }
  .note.muted{ background:var(--surface-2); color:var(--muted); }
  .note.muted .mono{ color:var(--text); }
  .variants{ margin:0 18px 12px; padding-top:8px; border-top:1px dashed var(--border); }
  .variants > .eyebrow{ margin-bottom:8px; }
  .variants .flow{ margin-bottom:10px; }
  .variants .flow:last-child{ margin-bottom:0; }
  .note .eyebrow{ color:inherit; opacity:.85; margin-bottom:2px; }
  .runtime-issue{ margin-top:4px; }
  .runtime-issue:first-of-type{ margin-top:0; }
  .empty{ padding:14px 18px; color:var(--muted); font-size:13.5px; }
  footer.page-foot{ margin-top:40px; padding-top:16px; border-top:1px solid var(--border); color:var(--faint); font-size:12px; display:flex; justify-content:space-between; gap:12px; }
  @media (max-width:760px){
    .board{ grid-template-columns:1fr; }
    .case-list{ position:static; flex-direction:row; flex-wrap:wrap; }
    .case{ width:auto; flex:1 1 220px; }
    .stats{ grid-template-columns:repeat(2,1fr); }
  }
`;
