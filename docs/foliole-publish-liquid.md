# Foliole Publish Liquid 主题契约

Foliole Publish 使用当前 library 中唯一一份可编辑主题：`Publish/Theme/`。选择 **Open theme** 可以直接编辑它；选择 **Reset theme** 会用当前版本的 Foliole 官方主题覆盖其中四个文件：

- `page.html`：主页的 Topic 短列表与每个独立 Topic 页面。
- `archive.html`：按发布时间倒序排列的归档页。
- `style.css`：整个静态站点的样式。
- `site.js`：可选的渐进增强脚本；官方主题默认不接管阅读导航。

普通 Liquid 输出会自动做 HTML 转义。只有 `page.content` 是 Foliole 已经生成的正文 HTML，应该使用 `{{ page.content | raw }}` 输出。

## 公开数据

以下字段是 Foliole Theme 可以依赖的公开契约。未列出的对象、内部字段或 JavaScript 原型属性都不是公开能力。

### `site`

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `site.title` | `string` | 站点标题。 |
| `site.url` | `string` | 站点公开地址；未连接托管时使用本地预览占位地址。 |
| `site.home_url` | `string` | 从站点根目录访问主页的相对路径。 |
| `site.archive_url` | `string` | 从站点根目录访问归档页的相对路径。 |
| `site.rss_url` | `string` | 从站点根目录访问 RSS 的相对路径。 |
| `site.cards` | `array` | 已发布 Topic，按最新更新时间倒序排列。 |

`site.cards` 中的每一项包含：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id` | `string` | 稳定页面 ID。 |
| `path` | `string` | 从站点根目录访问独立页面的相对路径。 |
| `title` | `string` | Topic 标题。 |
| `published_at` | ISO 8601 `string` | 首次发布时间。 |
| `updated_at` | ISO 8601 `string` | 最近发布时间。 |

### `page`

以下字段在 `page.html` 和 `archive.html` 中始终存在；不适用的值为 `null`、`false`、空字符串或空数组，不需要探测未定义变量。

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `page.kind` | `"card" \| "archive"` | 当前页面类型。 |
| `page.title` | `string` | 当前页面标题。 |
| `page.id` | `string \| null` | Topic 页面 ID；归档页为 `null`。 |
| `page.is_home` | `boolean` | 当前 `page.html` 是否正在生成主页。 |
| `page.content` | HTML `string` | Topic 正文 HTML；归档页为空。 |
| `page.published_at` | ISO 8601 `string \| null` | 首次发布时间。 |
| `page.updated_at` | ISO 8601 `string \| null` | 最近发布时间。 |
| `page.depth` | `"" \| "../"` | 从当前页面回到站点根目录的前缀。 |
| `page.home_url` | `string` | 从当前页面访问主页的相对 URL。 |
| `page.archive_url` | `string` | 从当前页面访问归档页的相对 URL。 |
| `page.rss_url` | `string` | 从当前页面访问 RSS 的相对 URL。 |
| `page.newer` / `page.older` | object `\| null` | 相邻 Topic；对象包含 `title` 与从当前页访问它的 `url`。 |
| `page.newer_url` / `page.older_url` | `string \| null` | 相邻 Topic URL 的简写。 |
| `page.fields` | `array` | 当前 Topic 的公开字段；归档页为空。 |
| `page.has_visible_fields` | `boolean` | 是否至少有一个非空字段。 |

`page.fields` 中的每一项包含 `key: string` 和 `values: string[]`。单值与多值在模板层统一为数组；空值会得到空数组，官方主题只显示 `values.size > 0` 的字段。

## 最小可复制示例

```liquid
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{ page.title }} — {{ site.title }}</title>
  <link rel="stylesheet" href="{{ page.depth }}style.css">
</head>
<body>
  <nav><a href="{{ page.home_url }}">{{ site.title }}</a> · <a href="{{ page.archive_url }}">Archive</a></nav>
  <main>
    <h1>{{ page.title }}</h1>
    {% for field in page.fields %}
      {% if field.values.size > 0 %}<p>{{ field.key }}: {{ field.values | join: ", " }}</p>{% endif %}
    {% endfor %}
    {{ page.content | raw }}
  </main>
</body>
</html>
```

## 兼容边界与错误

Foliole Liquid 是一组受限、稳定的静态页面变量，不是完整的 Jekyll、Shopify 或其他主题系统兼容层。

- 支持内嵌 Liquid 的变量、条件、循环和 LiquidJS 内置过滤器。
- 不支持 `include`、`layout`、`render`、插件、自定义代码执行或读取其他文件。
- 未知变量、未知过滤器与无效语法会报错，不会静默输出空内容。
- 单个模板最大 256 KiB，单个渲染结果最大 8 MiB；渲染同时受到时间和内存限制。
- 生成失败时，现有 `Publish/Site/` 保持不变。错误会指出具体主题文件及行列；修正后再次运行 Preview、Update local 或 Update Web 即可。

主题需要新增数据时，应先把字段加入本契约和自动化测试，再在默认主题中使用；不要依赖当前生成器的内部对象形状。
