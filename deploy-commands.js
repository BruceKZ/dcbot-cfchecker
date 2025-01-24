/******************************************************
 * deploy-commands.js
 * 用于在特定服务器或全局注册 Slash Commands
 *****************************************************/
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

import {BOT_TOKEN, CLIENT_ID, GUILD_ID} from './constants.js';

// 定义命令
const commands = [
    // /start
    new SlashCommandBuilder()
        .setName('start')
        .setDescription('开始绑定，获取随机字符串'),

    // /check <username>
    new SlashCommandBuilder()
        .setName('check')
        .setDescription('验证Codeforces用户名')
        .addStringOption(option =>
            option
                .setName('username')
                .setDescription('你的Codeforces用户名')
                .setRequired(true)
        ),

    // /whoami
    new SlashCommandBuilder()
        .setName('whoami')
        .setDescription('查看你在本Bot中的绑定状态'),

    // /cleanup <days>
    new SlashCommandBuilder()
        .setName('cleanup')
        .setDescription('清理超过指定天数仍未验证的记录，仅限管理员')
        .addIntegerOption(option =>
            option
                .setName('days')
                .setDescription('要清理多少天前未验证的记录')
                .setRequired(true)
        ),
].map(cmd => cmd.toJSON());

// REST 实例
const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

(async () => {
    try {
        console.log('开始注册 (/) 命令...');

        // 注册到指定服务器（Guild）快速生效
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands },
        );
        console.log('✅ 成功在指定服务器中注册/更新命令！');

        // 如果想全局注册(1小时-24小时生效)，使用：
        // await rest.put(
        //   Routes.applicationCommands(CLIENT_ID),
        //   { body: commands },
        // );
        // console.log('✅ 成功全局注册命令（可能需等待生效）');

    } catch (error) {
        console.error('❌ 注册命令时出错:', error);
    }
})();
