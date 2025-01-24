/******************************************************
 * index.js
 *
 * 功能:
 * 1) /start
 *    - 若已验证, 提示已绑定
 *    - 若未验证, 在内存中生成并保存随机串
 *
 * 2) /check <username>
 *    - 若已验证, 提示已绑定
 *    - 若未验证, 对比 randomString == Codeforces firstName ?
 *      -> 验证成功则写入数据库 + 分配角色 + 从内存删除
 *
 * 3) /whoami
 *    - 已验证: 从DB查, 显示CF handle + 验证时间
 *    - 未验证: 看内存里有没有, 有则显示随机串, 没有则提示还未开始
 *
 * 4) /cleanup <days>
 *    - 仅管理员可调用
 *    - 清理内存中那些 startedAt 超过 <days> 天且尚未验证的记录
 *
 * 注意:
 * - 数据库只存“已验证”的用户.
 * - 未验证用户的信息(随机串等)只在内存Map.
 *****************************************************/

const {Client, GatewayIntentBits, PermissionsBitField, MessageFlags} = require('discord.js');
const Database = require('better-sqlite3');

const fetch = global.fetch;

import {BOT_TOKEN, DB_PATH} from './constants';

// 1) 初始化数据库(若无则创建)
const db = new Database(DB_PATH);

// 2) 创建表: 仅存储已验证用户
db.prepare(`
    CREATE TABLE IF NOT EXISTS verified_users
    (
        userId
        TEXT
        PRIMARY
        KEY,
        codeforcesHandle
        TEXT,
        verifiedAt
        INTEGER
    )
`).run();

// 3) 预编译SQL语句: 插入已验证用户
const insertVerifiedStmt = db.prepare(`
    INSERT INTO verified_users (userId, codeforcesHandle, verifiedAt)
    VALUES (@userId, @codeforcesHandle, @verifiedAt)
`);

// 查询已验证记录
const selectVerifiedStmt = db.prepare(`
    SELECT *
    FROM verified_users
    WHERE userId = ?
`);

// =============== 内存Map: 存储"未验证用户"随机串信息 ==================
/**
 * userBindMap: Map<userId, { randomString: string, startedAt: number }>
 *   - randomString: 给用户的随机串
 *   - startedAt: 记录开始绑定的时间 (Date.now() 毫秒)
 */
const userBindMap = new Map();

// =============== 创建客户端 ===============
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers  // 因为要给用户加角色
    ]
});

// =============== 生成随机字符串 ===============
function generateRandomString(len = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < len; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// =============== Bot 就绪事件 ===============
client.once('ready', () => {
    console.log(`Bot 已上线: ${client.user.tag}`);
});

// =============== Slash Command 交互 ===============
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const {commandName} = interaction;

    // ============ /start ============
    if (commandName === 'start') {
        // 1) 检查数据库是否已验证
        const verifiedRow = selectVerifiedStmt.get(interaction.user.id);
        if (verifiedRow) {
            // 已验证，提示一下
            return interaction.reply({
                content: `你已经绑定过 Codeforces 账号：**${verifiedRow.codeforcesHandle}**。\n无需再次绑定。`,
                flags: MessageFlags.Ephemeral
            });
        }

        // 2) 未验证 -> 在内存 Map 中生成或更新一个随机串
        const randomString = generateRandomString(8);
        const startedAt = Date.now();
        userBindMap.set(interaction.user.id, {randomString, startedAt});

        // 3) 提示用户
        return interaction.reply({
            content: `请将 **Codeforces** 资料中的 **First name** 修改为：\`${randomString}\`\n修改后，使用 \`/check <你的CF用户名>\` 进行验证！`,
            flags: MessageFlags.Ephemeral
        });
    }

    // ============ /check <username> ============
    else if (commandName === 'check') {
        const username = interaction.options.getString('username', true);

        // 看数据库是否已验证
        const verifiedRow = selectVerifiedStmt.get(interaction.user.id);
        if (verifiedRow) {
            return interaction.reply({
                content: `你已经绑定过 Codeforces 账号：**${verifiedRow.codeforcesHandle}**，无需重复验证。`,
                flags: MessageFlags.Ephemeral
            });
        }

        // 如果不在内存 Map，就说明尚未 /start
        const bindInfo = userBindMap.get(interaction.user.id);
        if (!bindInfo) {
            return interaction.reply({
                content: '你还没有使用 `/start` 获取随机字符串。',
                flags: MessageFlags.Ephemeral
            });
        }

        // 校验 Codeforces
        try {
            const apiUrl = `https://codeforces.com/api/user.info?handles=${username}`;
            const response = await fetch(apiUrl);
            const data = await response.json();

            if (data.status !== 'OK') {
                return interaction.reply({
                    content: `无法查询到 Codeforces 用户: \`${username}\`。请检查拼写。`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const userInfo = data.result[0];
            const cfFirstName = userInfo.firstName ?? '';

            // 比对 firstName 和随机串
            if (cfFirstName === bindInfo.randomString) {
                // ======= 验证成功 =======
                // 1) 在数据库插入一条已验证记录
                insertVerifiedStmt.run({
                    userId: interaction.user.id,
                    codeforcesHandle: username,
                    verifiedAt: Date.now()
                });

                // 2) 从内存中移除
                userBindMap.delete(interaction.user.id);

                // 3) 给用户分配 "Verified" 角色
                const verifiedRole = interaction.guild.roles.cache.find(r => r.name === 'Verified');
                if (!verifiedRole) {
                    return interaction.reply({
                        content: '服务器中未找到名为 "Verified" 的角色，请联系管理员创建。',
                        flags: MessageFlags.Ephemeral
                    });
                }
                const member = interaction.guild.members.cache.get(interaction.user.id);
                if (!member) {
                    return interaction.reply({
                        content: '未能获取到你的成员信息，无法分配角色。',
                        flags: MessageFlags.Ephemeral
                    });
                }
                await member.roles.add(verifiedRole);

                return interaction.reply({
                    content: `恭喜验证成功！已绑定 Codeforces 账号：**${username}**。`,
                    flags: MessageFlags.Ephemeral
                });

            } else {
                // firstName 不匹配
                if (!userInfo.hasOwnProperty('firstName')) {
                    return interaction.reply({
                        content: '你在 Codeforces 上还没有设置 "First name"！请先去资料中填写，然后改成机器人给出的随机字符串。',
                        flags: MessageFlags.Ephemeral
                    });
                } else {
                    return interaction.reply({
                        content: `验证失败！你的 First name: "${cfFirstName}" 与"${bindInfo.randomString}" 不一致。请重新确认后再试。`,
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
        } catch (error) {
            console.error('访问 Codeforces API 出错：', error);
            return interaction.reply({
                content: '访问 Codeforces API 出错，请稍后再试。',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    // ============ /whoami ============
    else if (commandName === 'whoami') {
        // 1) 查数据库是否已验证
        const verifiedRow = selectVerifiedStmt.get(interaction.user.id);
        if (verifiedRow) {
            // 已验证
            const verifiedTimeStr = `<t:${Math.floor(verifiedRow.verifiedAt / 1000)}:F>`;
            return interaction.reply({
                content: `你已验证！\n**绑定的CF账号**: \`${verifiedRow.codeforcesHandle}\`\n**验证时间**: ${verifiedTimeStr}`,
                flags: MessageFlags.Ephemeral
            });
        }

        // 2) 查内存 Map (尚未验证)
        const bindInfo = userBindMap.get(interaction.user.id);
        if (bindInfo) {
            return interaction.reply({
                content: `你尚未完成验证。\n**随机串**: \`${bindInfo.randomString}\`\n**开始时间**: <t:${Math.floor(bindInfo.startedAt / 1000)}:F>\n请尽快修改CF firstName 并使用 \`/check\` 验证。`,
                flags: MessageFlags.Ephemeral
            });
        }

        // 3) 都没有 => 用户还没 /start
        return interaction.reply({
            content: '你还没有开始验证流程，请先使用 `/start`。',
            flags: MessageFlags.Ephemeral
        });
    }

    // ============ /cleanup <days> ============
    else if (commandName === 'cleanup') {
        // 仅管理员可用
        const member = interaction.guild.members.cache.get(interaction.user.id);
        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({
                content: '你没有权限使用此命令（需要 Manage Guild）。',
                flags: MessageFlags.Ephemeral
            });
        }

        const days = interaction.options.getInteger('days', true);
        const now = Date.now();
        const cutoff = now - days * 24 * 60 * 60 * 1000;

        // 在内存Map中遍历，清除 startedAt < cutoff 的条目
        let removedCount = 0;
        for (const [userId, bindInfo] of userBindMap.entries()) {
            if (bindInfo.startedAt < cutoff) {
                userBindMap.delete(userId);
                removedCount++;
            }
        }

        return interaction.reply({
            content: `已清理内存中**${removedCount}**位超过 **${days}** 天仍未验证的用户。`,
            flags: MessageFlags.Ephemeral
        });
    }
});

// 最后登录Bot
client.login(BOT_TOKEN);
