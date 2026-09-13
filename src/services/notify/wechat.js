// @ts-check
/** 企业微信自建应用通知渠道（支持 text / markdown）。 */
import { ok, fail, errorMessage, stripMarkdown } from './channel.js';

const API_ROOT = 'https://qyapi.weixin.qq.com/cgi-bin';

/** @type {import('./channel.js').Channel} */
export const wecomChannel = {
  // 保留渠道标识，避免已保存的 ENABLED_NOTIFIERS 配置失效。
  name: 'wechatbot',

  validateConfig(config) {
    const required = [
      ['WECOM_CORP_ID', config.WECOM_CORP_ID],
      ['WECOM_SECRET', config.WECOM_SECRET],
      ['WECOM_AGENT_ID', config.WECOM_AGENT_ID],
      ['WECOM_TO_USER', config.WECOM_TO_USER]
    ];
    const missing = required.filter(([, value]) => !String(value ?? '').trim()).map(([key]) => key);
    if (missing.length) return { ok: false, error: `缺少 ${missing.join('、')}` };
    if (!/^\d+$/.test(String(config.WECOM_AGENT_ID).trim())) {
      return { ok: false, error: 'WECOM_AGENT_ID 必须是数字' };
    }
    return { ok: true };
  },

  async send(payload, config) {
    const validation = wecomChannel.validateConfig(config);
    if (!validation.ok) return fail('wechatbot', validation.error || '配置无效');

    try {
      const tokenUrl = new URL(`${API_ROOT}/gettoken`);
      tokenUrl.searchParams.set('corpid', String(config.WECOM_CORP_ID).trim());
      tokenUrl.searchParams.set('corpsecret', String(config.WECOM_SECRET).trim());
      const tokenResponse = await fetch(tokenUrl.toString());
      const tokenResult = await tokenResponse.json();
      if (!tokenResponse.ok || tokenResult.errcode !== 0 || !tokenResult.access_token) {
        return fail('wechatbot', `获取 access_token 失败: errcode=${tokenResult.errcode ?? tokenResponse.status} ${tokenResult.errmsg || ''}`, tokenResult);
      }

      const msgType = config.WECOM_MSG_TYPE === 'markdown' ? 'markdown' : 'text';
      const content = msgType === 'markdown'
        ? `# ${payload.title}\n\n${payload.content}`
        : `${payload.title}\n\n${stripMarkdown(payload.content)}`;
      const message = {
        touser: String(config.WECOM_TO_USER).trim(),
        msgtype: msgType,
        agentid: Number(config.WECOM_AGENT_ID),
        [msgType]: { content },
        safe: 0
      };
      const sendResponse = await fetch(`${API_ROOT}/message/send?access_token=${encodeURIComponent(tokenResult.access_token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });
      const result = await sendResponse.json();
      if (!sendResponse.ok) return fail('wechatbot', `HTTP ${sendResponse.status}`, result);
      return result.errcode === 0
        ? ok('wechatbot', result)
        : fail('wechatbot', `企业微信返回 errcode=${result.errcode} ${result.errmsg || ''}`, result);
    } catch (err) {
      return fail('wechatbot', errorMessage(err));
    }
  },

  async test(config) {
    return wecomChannel.send({ title: '订阅管理 - 测试通知', content: '这是一条企业微信自建应用测试通知。' }, config);
  }
};

export async function sendWecomAppNotification(title, content, config) {
  const result = await wecomChannel.send({ title, content }, config);
  if (!result.success) console.error('[企业微信自建应用]', result.error);
  return result.success;
}
