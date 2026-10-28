const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

const TIME_ZONE = process.env.DISPLAY_TZ || "America/Sao_Paulo";

const time = (date) => new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIME_ZONE,
}).format(date);

const date = (value) => new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric", timeZone: TIME_ZONE,
}).format(value);

function countdown(resetsAt, now) {
  if (!resetsAt) return "Reset não informado";
  const seconds = Math.max(0, Math.floor((new Date(resetsAt) - now) / 1000));
  if (seconds === 0) return "Reset agora";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `Reset em ${days}d ${hours}h`;
  if (hours) return `Reset em ${hours}h ${minutes}min`;
  return `Reset em ${minutes}min`;
}

function usageWindow(label, value, now) {
  if (!value) return "";
  const percent = Math.min(100, Math.max(0, value.usedPercent));
  return `<div class="window"><div class="label">${label}</div><div class="meter-row"><div class="meter"><span class="fill" style="width:${percent}%"></span></div><div class="percent">${percent}%</div></div><div class="reset">${countdown(value.resetsAt, now)}</div></div>`;
}

function provider(name, state, now) {
  let body;
  if (state.available) {
    body = usageWindow("5 HORAS", state.fiveHour, now) + usageWindow("7 DIAS", state.weekly, now);
    if (!body) body = '<div class="error">Limites não informados</div>';
  } else {
    const auth = state.status === "not_authenticated";
    const message = auth ? "Não autenticado" : "Dados indisponíveis";
    const hint = auth ? "Autentique pelo terminal do CasaOS" : "Tente novamente em alguns minutos";
    body = `<div class="error">${message}<span class="hint">${hint}<br>Última tentativa: ${time(new Date(state.attemptedAt))}</span></div>`;
  }
  return `<section class="provider"><h1>${escapeHtml(name)}</h1>${body}</section>`;
}

export function renderDashboard(snapshot, now = new Date()) {
  const updated = new Date(snapshot.updatedAt);
  const stale = now - updated > 15 * 60 * 1000;
  const staleNotice = stale ? `<div class="stale">Dados desatualizados &mdash; última atualização: ${time(updated)}</div>` : "";
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="refresh" content="300"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Uso de IA</title>
<style>
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif}body{width:100%;max-width:600px;padding:12px 18px 8px}.clock{font-size:21px;font-weight:bold;overflow:hidden}.date{float:left}.updated{clear:both;padding-top:3px;font-size:17px}.provider+.provider{border-top:4px solid #000;padding-top:12px}.stale{margin-top:6px;border:3px solid #000;padding:4px 7px;font-size:16px;font-weight:bold}.provider{margin-top:14px}h1{margin:0 0 8px;border-bottom:4px solid #000;padding-bottom:3px;font-size:27px;line-height:1.05}.window{margin:0 0 8px}.label{font-size:18px;font-weight:bold;margin-bottom:2px}.meter-row{display:table;width:100%}.meter{display:table-cell;height:24px;border:3px solid #000;vertical-align:middle}.fill{display:block;height:18px;background:#000}.percent{display:table-cell;width:62px;padding-left:8px;text-align:right;font-size:23px;font-weight:bold;vertical-align:middle}.reset{margin-top:1px;font-size:17px}.error{min-height:60px;padding:7px 8px;border:3px solid #000;font-size:20px;font-weight:bold}.hint{display:block;margin-top:4px;font-size:16px;font-weight:normal}@media(max-height:620px){body{padding-top:7px}.provider{margin-top:9px}h1{font-size:24px;margin-bottom:5px}.window{margin-bottom:5px}}
</style></head><body><div class="clock"><span class="date">${date(now)}</span></div><div class="updated">Atualizado às ${time(updated)}</div>${staleNotice}${provider("CLAUDE CODE", snapshot.claude, now)}${provider("CODEX", snapshot.codex, now)}</body></html>`;
}

