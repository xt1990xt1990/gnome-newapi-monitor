import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// ─── 工具 ──────────────────────────────────────────────────────────────────────
function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function secsToMidnight() {
    const now  = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 10, 0);
    return Math.max(10, Math.ceil((next - now) / 1000));
}

function dbg(msg) {
    try {
        const line = `${new Date().toISOString()} ${msg}\n`;
        const f = Gio.File.new_for_path('/tmp/oneapi-debug.log');
        const s = f.append_to(Gio.FileCreateFlags.NONE, null);
        s.write_all(line, null);
        s.close(null);
    } catch(_) {}
}

// ─── curl → Promise<string> ────────────────────────────────────────────────────
function curlGet(args) {
    return new Promise((resolve, reject) => {
        let proc;
        try {
            proc = Gio.Subprocess.new(
                ['curl', '-sf', '--max-time', '15', ...args],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );
        } catch (e) { reject(e); return; }
        proc.communicate_utf8_async(null, null, (_p, res) => {
            try {
                const [, out] = _p.communicate_utf8_finish(res);
                resolve(out || '');
            } catch (e) { reject(e); }
        });
    });
}

// ─── 查询单站点 totalUsage（美元） ────────────────────────────────────────────
function fetchUsage(baseUrl, key) {
    const now  = new Date();
    const past = new Date(now.getTime() - 100 * 24 * 3600 * 1000);
    const fmt  = d => `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
    const url  = `${baseUrl}/v1/dashboard/billing/usage?start_date=${fmt(past)}&end_date=${fmt(now)}`;
    return curlGet(['-H', `Authorization: Bearer ${key}`, url]).then(raw => {
        const data = JSON.parse(raw);
        if (data.error) throw new Error(data.error.message || '接口错误');
        return (data.total_usage ?? 0) / 100;
    });
}

// ─── 指示器 ────────────────────────────────────────────────────────────────────
const BalanceIndicator = GObject.registerClass(
class BalanceIndicator extends PanelMenu.Button {

    _init(ext) {
        super._init(0.0, 'API Balance');
        this._ext = ext;
        this._s   = ext.getSettings();

        const box = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
        this._label = new St.Label({ text: '⏳', y_align: Clutter.ActorAlign.CENTER });
        box.add_child(this._label);
        this.add_child(box);

        this._buildMenu();

        this._modeId = this._s.connect('changed::panel-display-mode', () => {
            this._updateCheckmarks();
            if (this._lastR1 !== undefined) {
                this._renderTopbar(this._lastR1, this._lastR2, this._lastCfg);
            }
        });

        // 3 秒后启动，等 Shell 稳定
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
            this._boot();
            return GLib.SOURCE_REMOVE;
        });
    }

    // ── 菜单 ──────────────────────────────────────────────────────────────────
    _buildMenu() {
        const mk = style => {
            const it = new PopupMenu.PopupMenuItem('', { reactive: false });
            if (style) it.label.set_style(style);
            this.menu.addMenuItem(it);
            return it;
        };
        const sep = () => this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._s1Title = mk('font-size:12px;color:#888;');
        this._s1Today = mk('font-size:12px;color:#7ec8e3;');
        this._s1Total = mk('font-size:12px;color:#f0a500;');
        sep();
        this._s2Title = mk('font-size:12px;color:#888;');
        this._s2Today = mk('font-size:12px;color:#7ec8e3;');
        this._s2Total = mk('font-size:12px;color:#f0a500;');
        sep();
        this._timeItem = mk('font-size:11px;color:#888;');
        sep();

        const modeHdr = mk('font-size:11px;color:#888;');
        modeHdr.label.set_text('顶栏显示模式');
        this._mToday = new PopupMenu.PopupMenuItem('');
        this._mTotal = new PopupMenu.PopupMenuItem('');
        this._mToday.connect('activate', () => this._s.set_string('panel-display-mode', 'today'));
        this._mTotal.connect('activate', () => this._s.set_string('panel-display-mode', 'total'));
        this.menu.addMenuItem(this._mToday);
        this.menu.addMenuItem(this._mTotal);
        this._updateCheckmarks();
        sep();

        const mkBtn = (label, cb) => {
            const it = new PopupMenu.PopupMenuItem(label);
            it.connect('activate', cb);
            this.menu.addMenuItem(it);
        };
        mkBtn('🔄  立即刷新', () => this._doRefresh());
        mkBtn('⚙️  设置',    () => this._ext.openPreferences().catch(() => {}));
        mkBtn('❌  禁用扩展', () => {
            this.menu.close();
            imports.gi.Gio.Subprocess.new(
                ['gnome-extensions', 'disable', 'oneapi-balance@local'],
                imports.gi.Gio.SubprocessFlags.NONE
            );
        });
    }

    _updateCheckmarks() {
        const m = this._s.get_string('panel-display-mode');
        this._mToday.label.set_text(m === 'today' ? '✅ 今日消耗' : '   📅 今日消耗');
        this._mTotal.label.set_text(m === 'total' ? '✅ 累计消耗' : '   📊 累计消耗');
    }

    // ── 启动 ──────────────────────────────────────────────────────────────────
    _boot() {
        dbg('_boot 开始');
        if (this._s.get_string('snapshot-date') !== todayStr()) {
            dbg('今天无快照，执行 _doSnapshot');
            this._doSnapshot(false, () => {
                this._startRefreshTimer();
                this._scheduleMidnight();
            });
        } else {
            dbg('已有快照，执行 _doRefresh');
            this._doRefresh(() => {
                this._startRefreshTimer();
                this._scheduleMidnight();
            });
        }
    }

    // ── 定时器 ────────────────────────────────────────────────────────────────
    _startRefreshTimer() {
        if (this._refreshTimer) { GLib.source_remove(this._refreshTimer); this._refreshTimer = null; }
        const interval = Math.max(30, this._s.get_int('refresh-interval'));
        this._refreshTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._doRefresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _scheduleMidnight() {
        if (this._midnightTimer) { GLib.source_remove(this._midnightTimer); this._midnightTimer = null; }
        const secs = secsToMidnight();
        dbg(`距离0点 ${secs} 秒，届时触发快照`);
        this._midnightTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, secs, () => {
            dbg('0点到了，执行快照');
            this._doSnapshot(true, () => this._scheduleMidnight());
            return GLib.SOURCE_REMOVE;
        });
    }

    // ── 读配置 ────────────────────────────────────────────────────────────────
    _getCfg() {
        return {
            key1:  this._s.get_string('site1-key').trim(),
            url1:  this._s.get_string('site1-url').trim().replace(/\/$/, ''),
            name1: this._s.get_string('site1-name').trim() || '站点1',
            key2:  this._s.get_string('site2-key').trim(),
            url2:  this._s.get_string('site2-url').trim().replace(/\/$/, ''),
            name2: this._s.get_string('site2-name').trim() || '站点2',
        };
    }

    // ── 普通刷新（不动快照） ──────────────────────────────────────────────────
    _doRefresh(done) {
        const cfg = this._getCfg();
        this._label.set_text('⏳');
        const p1 = cfg.url1 && cfg.key1 ? fetchUsage(cfg.url1, cfg.key1) : Promise.reject(new Error('未配置'));
        const p2 = cfg.url2 && cfg.key2 ? fetchUsage(cfg.url2, cfg.key2) : Promise.reject(new Error('未配置'));
        Promise.allSettled([p1, p2]).then(([r1, r2]) => {
            dbg(`_doRefresh 完成 r1=${r1.status}(${r1.status==='fulfilled'?r1.value.toFixed(4):r1.reason}) r2=${r2.status}(${r2.status==='fulfilled'?r2.value.toFixed(4):r2.reason})`);
            this._render(r1, r2, cfg);
            if (done) done();
        });
    }

    // ── 快照：记录今日起点，可选发 Webhook ────────────────────────────────────
    _doSnapshot(sendWebhook, done) {
        const cfg = this._getCfg();
        dbg('_doSnapshot 开始');
        this._label.set_text('📌');
        const p1 = cfg.url1 && cfg.key1 ? fetchUsage(cfg.url1, cfg.key1) : Promise.reject(new Error('未配置'));
        const p2 = cfg.url2 && cfg.key2 ? fetchUsage(cfg.url2, cfg.key2) : Promise.reject(new Error('未配置'));
        Promise.allSettled([p1, p2]).then(([r1, r2]) => {
            dbg(`_doSnapshot allSettled r1=${r1.status} r2=${r2.status}`);

            const today    = todayStr();
            const prevDate = this._s.get_string('snapshot-date');
            const prevS1   = this._s.get_double('snapshot-site1');
            const prevS2   = this._s.get_double('snapshot-site2');

            // 昨日消耗 & 累加进 total（只在跨天时累加，避免重复）
            let yest1 = -1, yest2 = -1;
            if (prevDate && prevDate !== today) {
                if (r1.status === 'fulfilled' && prevS1 > 0) {
                    yest1 = Math.max(0, r1.value - prevS1);
                    this._s.set_double('total-consumed-site1',
                        this._s.get_double('total-consumed-site1') + yest1);
                }
                if (r2.status === 'fulfilled' && prevS2 > 0) {
                    yest2 = Math.max(0, r2.value - prevS2);
                    this._s.set_double('total-consumed-site2',
                        this._s.get_double('total-consumed-site2') + yest2);
                }
            }
            this._s.set_double('yesterday-consumed-site1', yest1);
            this._s.set_double('yesterday-consumed-site2', yest2);

            // 写入今日快照
            this._s.set_string('snapshot-date', today);
            if (r1.status === 'fulfilled') this._s.set_double('snapshot-site1', r1.value);
            if (r2.status === 'fulfilled') this._s.set_double('snapshot-site2', r2.value);

            dbg(`快照写入完成 date=${today} s1=${r1.status==='fulfilled'?r1.value.toFixed(4):'err'} s2=${r2.status==='fulfilled'?r2.value.toFixed(4):'err'}`);

            if (sendWebhook) this._sendWebhook(r1, r2, cfg, yest1, yest2);
            this._render(r1, r2, cfg);
            if (done) done();
        });
    }

    // ── 渲染菜单 + 顶栏 ───────────────────────────────────────────────────────
    _render(r1, r2, cfg) {
        this._s1Title.label.set_text(`── ${cfg.name1} ──`);
        this._s2Title.label.set_text(`── ${cfg.name2} ──`);

        const snapDate = this._s.get_string('snapshot-date');
        const isToday  = snapDate === todayStr();

        const fillSite = (result, idx, todayItem, totalItem) => {
            if (result.status !== 'fulfilled') {
                const msg = result.reason?.message ?? '未知错误';
                todayItem.label.set_text(msg === '未配置' ? '— 未配置 —' : `❌ ${msg}`);
                totalItem.label.set_text('');
                return;
            }
            const usage    = result.value;
            const snapKey  = idx === 1 ? 'snapshot-site1'        : 'snapshot-site2';
            const totKey   = idx === 1 ? 'total-consumed-site1'  : 'total-consumed-site2';
            const snap     = this._s.get_double(snapKey);
            const hist     = this._s.get_double(totKey);
            const todayVal = isToday ? Math.max(0, usage - snap) : null;
            const totalVal = usage; // 累计消耗 = API 返回的总用量

            todayItem.label.set_text(
                todayVal !== null
                    ? `📅 今日消耗：$${todayVal.toFixed(2)}`
                    : '📅 今日消耗：快照未就绪'
            );
            totalItem.label.set_text(`📊 累计消耗：$${totalVal.toFixed(2)}`);
        };

        fillSite(r1, 1, this._s1Today, this._s1Total);
        fillSite(r2, 2, this._s2Today, this._s2Total);

        // 缓存最新数据，供切换模式时直接用
        this._lastR1  = r1;
        this._lastR2  = r2;
        this._lastCfg = cfg;

        this._renderTopbar(r1, r2, cfg);

        const timeStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        this._timeItem.label.set_text(`🕐 ${timeStr}  |  📌 快照：${snapDate || '未初始化'}`);
    }

    // ── 只刷新顶栏（切换模式时用） ────────────────────────────────────────────
    _renderTopbar(r1, r2, cfg) {
        const mode    = this._s.get_string('panel-display-mode');
        const icon    = mode === 'total' ? '📊' : '📅';
        const isToday = this._s.get_string('snapshot-date') === todayStr();

        const fmtVal = (result, snapKey, totKey) => {
            if (!result || result.status !== 'fulfilled') return '--';
            const usage    = result.value;
            const snap     = this._s.get_double(snapKey);
            const todayVal = isToday ? Math.max(0, usage - snap) : null;
            if (mode === 'today') return todayVal !== null ? `$${todayVal.toFixed(2)}` : '--';
            return `$${usage.toFixed(2)}`;
        };

        const n1 = cfg ? cfg.name1 : (this._s.get_string('site1-name').trim() || '站点1');
        const n2 = cfg ? cfg.name2 : (this._s.get_string('site2-name').trim() || '站点2');
        const v1 = fmtVal(r1, 'snapshot-site1', 'total-consumed-site1');
        const v2 = fmtVal(r2, 'snapshot-site2', 'total-consumed-site2');

        this._label.set_text(`${icon}${n1} ${v1}  ${icon}${n2} ${v2}`);
    }

    // ── Discord Webhook ───────────────────────────────────────────────────────
    _sendWebhook(r1, r2, cfg, yest1, yest2) {
        if (!this._s.get_boolean('webhook-enabled')) return;
        const url = this._s.get_string('webhook-url').trim();
        if (!url) return;

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yestStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;

        const prevY1 = this._s.get_double('yesterday-consumed-site1');
        const prevY2 = this._s.get_double('yesterday-consumed-site2');

        const mkField = (result, name, yest, prevYest, totKey) => {
            if (result.status !== 'fulfilled') return null;
            const hist = this._s.get_double(totKey);
            let diffStr = '';
            if (yest >= 0 && prevYest >= 0) {
                const d = yest - prevYest;
                if (Math.abs(d) < 0.00001) diffStr = '  ↔️ 与前日持平';
                else if (d > 0)            diffStr = `  📈 +$${d.toFixed(4)}`;
                else                       diffStr = `  📉 -$${Math.abs(d).toFixed(4)}`;
            }
            return {
                name: `🌐 ${name}`,
                value: [
                    `📅 昨日消耗：**$${yest >= 0 ? yest.toFixed(4) : '?'}**${diffStr}`,
                    `📊 累计消耗：**$${hist.toFixed(4)}**`,
                    `📈 总用量：**$${result.value.toFixed(4)}**`,
                ].join('\n'),
                inline: true,
            };
        };

        const fields = [
            mkField(r1, cfg.name1, yest1, prevY1, 'total-consumed-site1'),
            mkField(r2, cfg.name2, yest2, prevY2, 'total-consumed-site2'),
        ].filter(Boolean);
        if (!fields.length) return;

        const now = new Date();
        const payload = JSON.stringify({
            username: 'API 消耗监控',
            embeds: [{
                title: `📊 每日消耗报告 · ${yestStr}`,
                description: `**${yestStr}** 全天 API 消耗汇总`,
                color: 0x5865F2,
                fields,
                footer: { text: `报告生成于 ${now.toLocaleString('zh-CN', { hour12: false })}` },
                timestamp: now.toISOString(),
            }],
        });

        try {
            dbg(`Webhook 发送中 url=${url.slice(0,40)}...`);
            const proc = Gio.Subprocess.new(
                ['curl', '-s', '--max-time', '15', '-X', 'POST',
                 '-H', 'Content-Type: application/json', '-d', payload, url],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );
            proc.communicate_utf8_async(null, null, (p, res) => {
                try {
                    const [, stdout, stderr] = p.communicate_utf8_finish(res);
                    dbg(`Webhook 响应: stdout=${stdout?.trim()} stderr=${stderr?.trim()}`);
                } catch (e2) { dbg(`Webhook 读取响应失败: ${e2.message}`); }
            });
        } catch (e) { dbg(`Webhook 启动失败: ${e.message}`); }
    }

    // ── 销毁 ──────────────────────────────────────────────────────────────────
    destroy() {
        if (this._modeId)        { this._s.disconnect(this._modeId); this._modeId = null; }
        if (this._refreshTimer)  { GLib.source_remove(this._refreshTimer); this._refreshTimer = null; }
        if (this._midnightTimer) { GLib.source_remove(this._midnightTimer); this._midnightTimer = null; }
        super.destroy();
    }
});

// ─── 扩展入口 ──────────────────────────────────────────────────────────────────
export default class APIBalanceExtension extends Extension {
    enable() {
        dbg('enable() 调用');
        this._indicator = new BalanceIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator, 1, 'right');
    }
    disable() {
        dbg('disable() 调用');
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
