const glados = async () => {
  console.log("开始签到");
  const notice =[];
  if (!process.env.GLADOS) return notice;

  // 过滤掉空行
  const lines = String(process.env.GLADOS).split('\n').filter(c => c.trim() !== '');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    let accountName = `账号 ${i + 1}`; // 默认名称
    let cookie = line;               // 默认全量当做 cookie

    // 解析 "账户名称 cookie" 格式
    const firstSpaceIndex = line.indexOf(' ');
    if (firstSpaceIndex !== -1) {
      const potentialName = line.substring(0, firstSpaceIndex);
      // 简单判断一下：如果空格前的字符串不包含 '=' 和 ';'，那大概率是你设置的账户名
      if (!potentialName.includes('=') && !potentialName.includes(';')) {
        accountName = potentialName;
        // 剩下的部分全部作为 cookie
        cookie = line.substring(firstSpaceIndex + 1).trim();
      }
    }

    try {
      const common = {
        'cookie': cookie,
        'origin': 'https://glados.cloud',
        'user-agent': 'Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.0)',
      };
      const action = await fetch('https://glados.cloud/api/user/checkin', {
        method: 'POST',
        headers: { ...common, 'content-type': 'application/json' },
        body: '{"token":"glados.cloud"}',
      }).then((r) => r.json());
      
      if (action?.code) throw new Error(action?.message);
      
      const status = await fetch('https://glados.rocks/api/user/status', {
        method: 'GET',
        headers: { ...common },
      }).then((r) => r.json());
      
      if (status?.code) throw new Error(status?.message);
      
      // 使用解析出来的 accountName
      notice.push(
        `【${accountName}】Checkin OK`,
        `${action?.message}`,
        `Left Days ${Number(status?.data?.leftDays)}`
      );
    } catch (error) {
      // 签到失败时也带上对应的 accountName
      notice.push(
        `【${accountName}】Checkin Error`,
        `${error.message || error}`,
        `<${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}>`
      );
    }
  }
  console.log("签到结果:\n" + notice.join('\n'));
  return notice;
}

const notify = async (notice) => {
  if (!process.env.NOTIFY || !notice || notice.length === 0) return;

  // 1. 检查是否有任意账号天数小于 30 天
  const hasLowDays = notice.some(item => {
    const match = String(item).match(/Left Days ([\d.]+)/);
    return match && Number(match[1]) < 30;
  });

  // 2. 检查是否有任意账号签到报错
  const hasError = notice.some(item => String(item).includes('Checkin Error'));

  // 3. 动态生成标题
  let title = 'GLaDOS 签到通知';
  if (hasError) {
    title = 'GLaDOS 签到失败告警 (多账号部分或全部异常)';
  } else if (hasLowDays) {
    title = 'GLaDOS 余额不足30天告警';
  } else {
    title = 'GLaDOS 签到成功';
  }

  // 4. 免打扰逻辑：所有账号都【没有报错】且【天数均>=30天】时，静默不发通知
  if (!hasLowDays && !hasError) {
    return;
  }

  const content = notice.join('<br>');

  for (const option of String(process.env.NOTIFY).split('\n')) {
    if (!option) continue;
    try {
      if (option.startsWith('console:')) {
        console.log('通知标题:', title);
        for (const line of notice) {
          console.log(line);
        }
      } else if (option.startsWith('wxpusher:')) {
        await fetch('https://wxpusher.zjiecode.com/api/send/message', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            appToken: option.split(':')[1],
            summary: title, 
            content: content,
            contentType: 3,
            uids: option.split(':').slice(2),
          }),
        });
      } else if (option.startsWith('pushplus:')) {
        await fetch('https://www.pushplus.plus/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token: option.split(':')[1],
            title: title, 
            content: content,
            template: 'markdown',
          }),
        });
      } else if (option.startsWith('serverchan:')) {
        await fetch(`https://sctapi.ftqq.com/${option.split(':')[1]}.send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: title, 
            content: content,
            template: 'markdown',
          }),
        });
      } else if (option.startsWith('qyweixin:')) {
        const qyweixinToken = option.split(':')[1];
        const qyweixinNotifyRebotUrl = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=' + qyweixinToken;
        await fetch(qyweixinNotifyRebotUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            msgtype: 'markdown',
            markdown: {
              content: `### <font color="warning">${title}</font>\n\n${content.replace(/<br>/g, '\n')}`
            }
          }),
        });
      } else {
        // fallback (默认处理 Pushplus)
        await fetch('https://www.pushplus.plus/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token: option,
            title: title, 
            content: content,
            template: 'markdown',
          }),
        });
      }
    } catch (error) {
      console.error(`通知发送失败 (${option.split(':')[0]}):`, error);
    }
  }
}

const main = async () => {
  await notify(await glados());
}

main();