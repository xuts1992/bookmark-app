# -*- coding: utf-8 -*-
import json
import random
import urllib.request as u
import urllib.error

BASE = 'http://localhost:9800'


def req(method, path, data=None):
    body = json.dumps(data).encode('utf-8') if data is not None else None
    r = u.Request(BASE + path, data=body, method=method,
                  headers={'Content-Type': 'application/json; charset=utf-8'})
    try:
        with u.urlopen(r, timeout=10) as x:
            return x.status, x.read().decode('utf-8')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')


# 1) 清空现有书签
lst = json.loads(req('GET', '/api/bookmarks?limit=500')[1])
for b in lst:
    req('DELETE', '/api/bookmarks/%d' % b['id'])
print('清空已有书签:', len(lst))

# 2) 生成 100 条中文测试数据
domains = ["github.com", "gitlab.com", "stackoverflow.com", "youtube.com",
           "bilibili.com", "zhihu.com", "wikipedia.org", "juejin.cn",
           "csdn.net", "cnblogs.com", "medium.com", "dev.to", "react.dev",
           "vuejs.org", "nodejs.org", "python.org", "go.dev", "kubernetes.io",
           "docker.com", "arxiv.org", "leetcode.cn", "figma.com", "notion.so",
           "infoq.com", "v2ex.com"]
topics = ["Vue", "React", "Go", "Python", "Kubernetes", "Docker", "Rust",
          "TypeScript", "PostgreSQL", "Redis", "GraphQL", "机器学习",
          "前端工程化", "微服务", "Serverless", "Linux", "Nginx", "Kafka",
          "Elasticsearch", "Tailwind"]
templates = ["深入理解{t}的核心原理", "{t}最佳实践与踩坑记录", "从零开始学{t}",
             "{t}官方文档精读", "10 个提升{t}效率的小技巧", "{t}面试题汇总",
             "我用{t}做了个小项目", "{t}性能优化指南", "{t}入门到精通",
             "{t}常见误区解析"]
tags = ["开发", "前端", "后端", "工具", "学习", "设计", "AI", "数据库",
        "云计算", "效率", "文档", "社区", "教程", "开源", "运维", "安全"]

random.seed(20260731)
ok = 0
for i in range(1, 101):
    d = domains[i % len(domains)]
    t = topics[random.randint(0, len(topics) - 1)]
    title = templates[random.randint(0, len(templates) - 1)].format(t=t)
    url = "https://%s/p/%d" % (d, i)
    fav = "https://%s/favicon.ico" % d
    n = random.randint(1, 3)
    picked = set()
    while len(picked) < n:
        picked.add(tags[random.randint(0, len(tags) - 1)])
    payload = {"title": title, "url": url, "favicon": fav,
               "tags": ",".join(picked)}
    st, _ = req('POST', '/api/bookmarks', payload)
    if st in (200, 201):
        ok += 1

stats = json.loads(req('GET', '/api/stats')[1])
print('成功写入:', ok, '| 数据库总数:', stats['total'], '| 今日新增:', stats['today'])
