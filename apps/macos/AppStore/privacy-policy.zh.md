# Eatit 隐私政策

> Effective date / 生效日期: 2026-05-05

本文档阐述 Eatit macOS 应用如何处理你的数据。**结论先行:Eatit 不在任何服务器上收集、存储或分析任何用户数据。** 你的所有面试内容、简历、报告、转写记录均只存在于你自己的 Mac 上。

---

## 1. 我们是谁

Eatit 是一款运行在 macOS 上的本地原生模拟面试工具。它没有自己的后端服务器、账号系统或云存储。你使用 Eatit 时,所有计算均在你的设备上完成,或通过你自己配置的第三方 API(大模型 / 语音识别)处理。

Eatit 是开源个人项目,主仓地址:https://github.com/dqh3388ok-cloud/eatit

---

## 2. 我们收集什么数据

**我们不收集任何用户数据。**

Eatit 没有分析服务、没有错误追踪后台、没有遥测管道。以下类别的数据永远不会离开你的设备并到达 Eatit 控制的服务器:

| 数据类别 | 是否收集 |
|---|---|
| 简历内容 | 否 |
| 面试转写记录 | 否 |
| 姓名 / 邮箱 / 电话 | 否 |
| IP 地址 | 否 |
| Cookies | 否 |
| 设备标识符(IDFA / 序列号等) | 否 |
| 浏览器历史 | 否 |
| 通讯录 / 联系人 | 否 |
| 位置信息 | 否 |
| 健康数据 | 否 |
| 财务信息 | 否 |
| 照片 / 相机数据 | 否 |
| 麦克风元数据 | 否 |
| 传感器数据 | 否 |

Eatit 仅请求麦克风权限用于录制你在面试中的语音作答;该音频直接送往你配置的 ASR Provider 进行转写,Eatit 不缓存、不存档、不可见。

---

## 3. 你的数据存在哪里

所有面试记录、解析结果和设置偏好均保存在本机 macOS 沙盒容器中:

```
~/Library/Containers/com.eatit.desktop/
```

该目录由 macOS 沙盒机制严格隔离,其他应用无法访问。**卸载 Eatit 后,macOS 会自动删除该目录下的全部数据。** Eatit 不具备将此数据同步到任何外部位置的能力。

你的 API Key 以加密形式保存在 macOS 钥匙串(Keychain)中。卸载应用后,macOS 会随沙盒一并清除该钥匙串条目。

---

## 4. 出站请求

Eatit 本身不与任何 Eatit 控制的服务器通信。以下是应用可能发起出站连接的唯一情形:

### 4.1 大模型(LLM)调用

Eatit 采用自带密钥(BYOK, Bring Your Own Key)模式。你在「设置」中配置所选 Provider 的 API Key 和 Base URL 后,Eatit 将把面试问答文本直接发送至你所指定的 LLM Provider 端点。支持的 Provider 包括(但不限于):

- 硅基流动 SiliconFlow(`https://api.siliconflow.cn/v1`)
- DeepSeek(`https://api.deepseek.com/v1`)
- 阿里云百炼 DashScope(`https://dashscope.aliyuncs.com/compatible-mode/v1`)
- OpenAI(`https://api.openai.com/v1`)
- Anthropic(`https://api.anthropic.com/v1`)
- 自定义端点(你自行填写 Base URL)

**Eatit 不中转、不缓存、不记录这些请求。** 内容仅从你的设备直接发往你指定的端点。你与该 Provider 之间形成直接的数据处理关系,适用该 Provider 自身的隐私政策。

### 4.2 语音识别(ASR)调用

如果你开启语音模式,录音内容将通过 WebSocket 直接发送到你配置的 ASR Provider 端点。Eatit 不拦截、不存储该音频或转写结果。

### 4.3 联网情报检索(可选,默认关闭)

当你在「设置」中主动启用「联网情报检索」功能时,Eatit 会将 JD 中识别到的**公司名、岗位名、行业关键词**发送给你的大模型用于公开信息检索。**简历正文、姓名、邮箱、电话及任何可识别个人身份的信息永远不会通过此功能出站。** 该功能默认关闭,你可随时在「设置」中关闭。

---

## 5. 第三方服务方

Eatit 本身不引入任何第三方 SDK 或服务。你在「设置」中配置的 LLM Provider 和 ASR Provider 属于你主动选择建立连接的第三方服务。你应当查阅各 Provider 自身的隐私政策以了解他们如何处理你发送的请求内容:

- 硅基流动:https://cloud.siliconflow.cn/
- DeepSeek:https://platform.deepseek.com/
- 阿里云百炼:https://bailian.console.aliyun.com/
- OpenAI:https://openai.com/privacy
- Anthropic:https://www.anthropic.com/privacy

如果你使用火山引擎方舟(Volcengine Ark)作为自定义端点,出站 host 为 `ark.cn-beijing.volces.com`;字节跳动语音开放平台(SAUC)的 ASR WebSocket host 为 `openspeech.bytedance.com`。
- 火山引擎隐私政策:https://www.volcengine.com/docs/privacy
- 字节跳动语音开放平台:https://www.volcengine.com/

**Eatit 与上述任何 Provider 均无商业合作、数据共享或转包关系。** Eatit 仅作为客户端工具,将你的请求按你的配置路由到你选择的端点。

---

## 6. API Key 处理

你的 API Key 的完整生命周期如下:

1. **输入**:你在「设置」中输入 API Key。
2. **存储**:Key 以加密形式保存在 macOS 钥匙串(Keychain)中,service 名称为 `com.eatit.desktop`。**Key 不写入任何日志文件、不写入 SQLite 数据库、不写入任何纯文本文件。**
3. **使用**:发起 LLM / ASR 请求时,Key 仅在内存中短暂存在,并通过 HTTP 请求头传递给你指定的 Provider 端点。
4. **可见性**:Eatit 工程师、Eatit 服务器(不存在)永远无法看到你的 Key。
5. **清除**:卸载 Eatit 后,macOS 随沙盒容器自动清除 Keychain 条目。你也可以在「设置 → 数据管理」中手动清除。

---

## 7. 无跟踪、无分析

Eatit 不集成任何分析或错误追踪服务。以下服务在 Eatit 中**均不存在**:

- Sentry
- Firebase / Google Analytics
- Mixpanel
- PostHog
- Amplitude
- Segment
- Crashlytics
- AppsFlyer
- 任何其他遥测 SDK

Eatit 不收集崩溃报告、不收集使用统计、不收集功能点击数据。如遇到问题,请通过下方联系方式与我们联系。

---

## 8. Apple App Store 隐私分类

按照 Apple App Store 的隐私标签规范,Eatit 的数据收集类别为:

**Data Not Collected(不收集数据)**

Eatit 不收集与你的身份相关联或用于追踪目的的任何数据。

---

## 9. 你的控制

你对自己的数据拥有完全控制权:

- **清除 API Key**:前往「设置 → 数据管理」→「清空本地数据」,可清除保存在钥匙串中的 API Key 配置。
- **清除本地数据**:卸载 Eatit 即可删除 `~/Library/Containers/com.eatit.desktop/` 下的全部面试记录和应用数据。
- **关闭联网检索**:在「设置 → 联网情报检索」关闭该功能,Eatit 将不再向 LLM Provider 发送 JD 关键词。

你无需向 Eatit 提交任何删除请求,因为我们从未持有你的数据。

---

## 10. 儿童隐私

Eatit 面向求职者和在职专业人士设计,不专门针对儿童。

- 在大多数国家和地区:本应用面向 13 岁及以上用户。
- 在中国大陆:根据相关规定,本应用面向 14 岁及以上用户。

由于 Eatit 不收集任何数据,我们也无法识别用户年龄。如果你是未成年人,请在监护人指导下使用本应用。

---

## 11. 政策变更

本隐私政策发生实质性变更时,我们将通过 App Store 更新说明(Release Notes)告知用户。继续使用更新版本的应用即表示你已查阅并接受新版政策。重要变更将在发布前不少于 7 天通过 Release Notes 预告。

政策历史版本通过 Git commit 记录保存在主仓中,你可随时查阅:
https://github.com/dqh3388ok-cloud/eatit

---

## 12. 管辖法律与争议解决

本政策受中华人民共和国法律管辖。如与本政策相关的任何争议无法通过友好协商解决,双方同意提交有管辖权的中国法院处理。

---

## 13. 联系方式

如对本隐私政策有任何疑问,请通过以下方式联系我们:

- **电子邮件**:[support@eatit.example](mailto:support@eatit.example) *(部署时请替换为真实联系邮箱)*
- **GitHub Issues**:https://github.com/dqh3388ok-cloud/eatit/issues

---

*Eatit 是开源个人项目。本隐私政策采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 授权,你可自由改编用于你自己的开源项目。*

*最后更新:2026-05-05*
