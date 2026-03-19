import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

export default class APIBalancePreferences extends ExtensionPreferences {

    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window.set_title('API 余额监控 - 设置');
        window.set_default_size(600, 600);

        // ── 主页面 ──
        const page = new Adw.PreferencesPage({
            title: '基本设置',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        // ── 站点1 配置组 ──
        const site1Group = new Adw.PreferencesGroup({
            title: '站点 1',
            description: '第一个 OneAPI 服务站点',
        });
        page.add(site1Group);

        const site1NameRow = new Adw.EntryRow({
            title: '站点名称',
            text: settings.get_string('site1-name'),
            show_apply_button: true,
        });
        site1NameRow.connect('apply', () => {
            settings.set_string('site1-name', site1NameRow.get_text().trim());
        });
        site1Group.add(site1NameRow);

        const site1UrlRow = new Adw.EntryRow({
            title: 'API 地址',
            text: settings.get_string('site1-url'),
            show_apply_button: true,
        });
        site1UrlRow.connect('apply', () => {
            settings.set_string('site1-url', site1UrlRow.get_text().trim());
        });
        site1Group.add(site1UrlRow);

        const site1KeyRow = new Adw.PasswordEntryRow({
            title: 'API Key（sk-xxxxx）',
            text: settings.get_string('site1-key'),
            show_apply_button: true,
        });
        site1KeyRow.connect('apply', () => {
            settings.set_string('site1-key', site1KeyRow.get_text().trim());
        });
        site1Group.add(site1KeyRow);

        // ── 站点2 配置组 ──
        const site2Group = new Adw.PreferencesGroup({
            title: '站点 2',
            description: '第二个 OneAPI 服务站点（可选）',
        });
        page.add(site2Group);

        const site2NameRow = new Adw.EntryRow({
            title: '站点名称',
            text: settings.get_string('site2-name'),
            show_apply_button: true,
        });
        site2NameRow.connect('apply', () => {
            settings.set_string('site2-name', site2NameRow.get_text().trim());
        });
        site2Group.add(site2NameRow);

        const site2UrlRow = new Adw.EntryRow({
            title: 'API 地址',
            text: settings.get_string('site2-url'),
            show_apply_button: true,
        });
        site2UrlRow.connect('apply', () => {
            settings.set_string('site2-url', site2UrlRow.get_text().trim());
        });
        site2Group.add(site2UrlRow);

        const site2KeyRow = new Adw.PasswordEntryRow({
            title: 'API Key（sk-xxxxx）',
            text: settings.get_string('site2-key'),
            show_apply_button: true,
        });
        site2KeyRow.connect('apply', () => {
            settings.set_string('site2-key', site2KeyRow.get_text().trim());
        });
        site2Group.add(site2KeyRow);

        // ── 显示配置组 ──
        const displayGroup = new Adw.PreferencesGroup({
            title: '显示设置',
        });
        page.add(displayGroup);

        const intervalRow = new Adw.SpinRow({
            title: '刷新间隔',
            subtitle: '自动更新余额的频率（秒），最小 30 秒',
            adjustment: new Gtk.Adjustment({
                lower: 30,
                upper: 3600,
                step_increment: 30,
                value: settings.get_int('refresh-interval'),
            }),
        });
        intervalRow.connect('notify::value', () => {
            settings.set_int('refresh-interval', intervalRow.get_value());
        });
        displayGroup.add(intervalRow);

        // 顶栏显示模式下拉
        const modeRow = new Adw.ComboRow({
            title: '顶栏显示模式',
            subtitle: '选择状态栏图标显示的数据类型',
        });

        const modeModel = new Gtk.StringList();
        modeModel.append('📅 今日消耗');
        modeModel.append('📊 累计消耗');
        modeRow.set_model(modeModel);

        const modeMap = { 'today': 0, 'total': 1 };
        const modeKeys = ['today', 'total'];
        const currentMode = settings.get_string('panel-display-mode');
        modeRow.set_selected(modeMap[currentMode] ?? 0);

        modeRow.connect('notify::selected', () => {
            const idx = modeRow.get_selected();
            settings.set_string('panel-display-mode', modeKeys[idx]);
        });
        displayGroup.add(modeRow);

        // ── 消耗统计组 ──
        const statsGroup = new Adw.PreferencesGroup({
            title: '消耗统计',
            description: '查看记录的消耗数据（只读）',
        });
        page.add(statsGroup);

        // 站点1 今日快照起点
        const snap1  = settings.get_double('snapshot-site1');
        const statsRow1 = new Adw.ActionRow({
            title: `站点1 今日快照起点`,
            subtitle: `$${snap1.toFixed(4)}`,
        });
        statsGroup.add(statsRow1);

        // 站点2 今日快照起点
        const snap2  = settings.get_double('snapshot-site2');
        const statsRow2 = new Adw.ActionRow({
            title: `站点2 今日快照起点`,
            subtitle: `$${snap2.toFixed(4)}`,
        });
        statsGroup.add(statsRow2);

        // 快照日期
        const snapDate = settings.get_string('snapshot-date') || '尚未记录';
        const snapDateRow = new Adw.ActionRow({
            title: '今日快照日期',
            subtitle: snapDate,
        });
        statsGroup.add(snapDateRow);

        // 重置累计消耗按钮
        const resetRow = new Adw.ActionRow({
            title: '重置累计消耗',
            subtitle: '清零所有累计消耗数据和快照（不可恢复）',
        });
        const resetBtn = new Gtk.Button({
            label: '重置',
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });
        resetBtn.connect('clicked', () => {
            settings.set_double('total-consumed-site1', 0.0);
            settings.set_double('total-consumed-site2', 0.0);
            settings.set_double('snapshot-site1', 0.0);
            settings.set_double('snapshot-site2', 0.0);
            settings.set_string('snapshot-date', '');
            statsRow1.set_subtitle('$0.0000');
            statsRow2.set_subtitle('$0.0000');
            snapDateRow.set_subtitle('尚未记录');
        });
        resetRow.add_suffix(resetBtn);
        statsGroup.add(resetRow);

        // ── 使用说明 ──
        const webhookGroup = new Adw.PreferencesGroup({
            title: 'Discord Webhook 通知',
            description: '每天0点自动发送昨日消耗报告到 Discord 频道',
        });
        page.add(webhookGroup);

        const webhookEnabledRow = new Adw.SwitchRow({
            title: '启用 Webhook 通知',
            subtitle: '开启后每天0点自动推送消耗报告',
            active: settings.get_boolean('webhook-enabled'),
        });
        webhookEnabledRow.connect('notify::active', () => {
            settings.set_boolean('webhook-enabled', webhookEnabledRow.get_active());
        });
        webhookGroup.add(webhookEnabledRow);

        const webhookUrlRow = new Adw.EntryRow({
            title: 'Webhook URL',
            text: settings.get_string('webhook-url'),
            show_apply_button: true,
        });
        webhookUrlRow.connect('apply', () => {
            settings.set_string('webhook-url', webhookUrlRow.get_text().trim());
        });
        webhookGroup.add(webhookUrlRow);

        // ── 测试 Webhook 按钮 ──
        const testRow = new Adw.ActionRow({
            title: '发送测试消息',
            subtitle: '点击右侧按钮，向当前 Webhook URL 发送一条测试通知',
        });

        const testBtn = new Gtk.Button({
            label: '🚀 测试',
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });

        // 状态标签（显示成功/失败反馈）
        const statusLabel = new Gtk.Label({
            label: '',
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
            margin_end: 8,
        });

        testBtn.connect('clicked', () => {
            const url = webhookUrlRow.get_text().trim() || settings.get_string('webhook-url').trim();
            if (!url) {
                statusLabel.set_label('⚠️ 请先填写 URL');
                return;
            }

            testBtn.set_sensitive(false);
            statusLabel.set_label('发送中…');

            const now = new Date();
            const payload = JSON.stringify({
                username: 'API 余额监控',
                embeds: [{
                    title: '🔔 Webhook 测试消息',
                    description: '这是一条来自 **oneapi-balance** 扩展的测试通知，说明 Webhook 接入成功！',
                    color: 0x57F287,   // Discord 绿
                    fields: [
                        { name: '状态', value: '✅ 连接正常', inline: true },
                        { name: '时间', value: now.toLocaleString('zh-CN', { hour12: false }), inline: true },
                    ],
                    footer: { text: 'oneapi-balance · 测试' },
                    timestamp: now.toISOString(),
                }],
            });

            try {
                const proc = Gio.Subprocess.new(
                    [
                        'curl', '-sf', '--max-time', '10',
                        '-o', '/dev/null',
                        '-w', '%{http_code}',
                        '-X', 'POST',
                        '-H', 'Content-Type: application/json',
                        '-d', payload,
                        url,
                    ],
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
                );
                proc.communicate_utf8_async(null, null, (_proc, res) => {
                    try {
                        const [, stdout] = _proc.communicate_utf8_finish(res);
                        const code = (stdout || '').trim();
                        if (code === '204' || code === '200') {
                            statusLabel.set_label('✅ 发送成功');
                        } else {
                            statusLabel.set_label(`❌ 失败 (HTTP ${code || '?'})`);
                        }
                    } catch (e) {
                        statusLabel.set_label(`❌ ${e.message}`);
                    } finally {
                        testBtn.set_sensitive(true);
                    }
                });
            } catch (e) {
                statusLabel.set_label(`❌ ${e.message}`);
                testBtn.set_sensitive(true);
            }
        });

        testRow.add_suffix(statusLabel);
        testRow.add_suffix(testBtn);
        webhookGroup.add(testRow);

        // ── 使用说明 ──
        const tipGroup = new Adw.PreferencesGroup({
            title: '使用说明',
        });
        page.add(tipGroup);

        const tipRow = new Adw.ActionRow({
            title: '填写完成后点击右侧 ✓ 保存，然后点击顶栏图标「立即刷新」即可看到余额',
            subtitle: '站点2 为可选，不填则显示"未配置"；顶栏模式也可在下拉菜单中实时切换',
        });
        tipGroup.add(tipRow);
    }
}
