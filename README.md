# Oneapi Balance Monitor

GNOME Shell 扩展，实时监控 OneAPI 余额和消耗情况。

## 功能

- 顶栏实时显示今日消耗 / 累计消耗
- 支持两个 OneAPI 站点同时监控
- 每日 0 点自动快照，记录消耗数据
- Discord Webhook 每日消耗报告推送
- 自定义刷新间隔（最低 30 秒）

## 安装

```bash
# 复制到 GNOME Shell 扩展目录
cp -r . ~/.local/share/gnome-shell/extensions/oneapi-balance@local

# 编译 schema
glib-compile-schemas schemas/

# 重启 GNOME Shell（X11 下按 Alt+F2 输入 r，Wayland 需注销重登）
```

## 配置

安装后在扩展设置中填写：
- 站点名称、API 地址、API Key
- 刷新间隔
- 顶栏显示模式（今日消耗 / 累计消耗）
- Discord Webhook URL（可选）

## 兼容性

GNOME Shell 45 / 46 / 47

## License

MIT
