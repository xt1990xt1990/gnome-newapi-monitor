# gnome-newapi-monitor

GNOME Shell 扩展 · OneAPI 双站点消耗监控

## 功能

- 顶栏实时显示 **今日消耗** 或 **累计消耗**（可切换）
- 支持两个 OneAPI 站点同时监控
- 每日 0 点自动快照，计算当日消耗
- Discord Webhook 每日推送：昨日消耗 + 较前日对比
- 扩展重启时若跨天未推送，自动补发 Webhook

## 安装

```bash
# 克隆到扩展目录
git clone https://github.com/xt1990xt1990/gnome-newapi-monitor.git \
  ~/.local/share/gnome-shell/extensions/oneapi-balance@local

# 编译 schema
glib-compile-schemas ~/.local/share/gnome-shell/extensions/oneapi-balance@local/schemas/

# 启用
gnome-extensions enable oneapi-balance@local
```

## 配置

通过扩展首选项界面配置：

| 项目 | 说明 |
|------|------|
| 站点1/2 URL | OneAPI 服务地址（如 `https://api.example.com`）|
| 站点1/2 Key | API 密钥（`sk-...`）|
| 站点1/2 名称 | 显示名称 |
| 刷新间隔 | 数据刷新频率（秒，最低 30）|
| Discord Webhook | 每日 0 点推送地址 |
| 顶栏显示模式 | 今日消耗 / 累计消耗 |

## 接口说明

使用 `/v1/dashboard/billing/usage` 接口获取 `total_usage`（÷100 = 美元）。

## 环境要求

- GNOME Shell 46+
- `curl`

## 调试

日志输出至 `/tmp/oneapi-debug.log`。
