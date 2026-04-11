const yaml = require('js-yaml')
const fs = require('fs')
const path = require('path')

// 支持容器（/app/config.yaml）和本地（../../config.yaml）
const candidates = [
  path.resolve(__dirname, '../config.yaml'),
  path.resolve(__dirname, '../../config.yaml'),
]
const CONFIG_PATH = candidates.find(p => fs.existsSync(p) && fs.statSync(p).isFile()) || candidates[1]

if (fs.existsSync(CONFIG_PATH) && fs.statSync(CONFIG_PATH).isDirectory()) {
  console.error(`\n[ERROR] config.yaml 是一个目录而不是文件！\n请在宿主机先创建 config.yaml 文件再启动容器。\n路径: ${CONFIG_PATH}\n`)
  process.exit(1)
}
const cfg = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'))

module.exports = cfg
