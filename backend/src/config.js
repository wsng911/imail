const yaml = require('js-yaml')
const fs = require('fs')
const path = require('path')

// 支持容器（/app/config.yaml）和本地（../../config.yaml）
const candidates = [
  path.resolve(__dirname, '../config.yaml'),
  path.resolve(__dirname, '../../config.yaml'),
]
const CONFIG_PATH = candidates.find(p => fs.existsSync(p)) || candidates[1]
const cfg = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'))

module.exports = cfg
