# B-Side 统一 MinIO 开发数据

这套文件与 `back/seeds/full_seed.sql` 中的对象路径完全对应，可让每位队友得到相同的测试音频、封面和 Bucket 配置。

## 内容

```text
storage-seed/
├── buckets/
│   ├── bside-tracks/
│   │   ├── audio/
│   │   └── test/
│   ├── bside-covers/
│   └── bside-avatars/
├── seed_minio.sh
├── verify_minio.sh
├── manifest.csv
└── full_seed.sql
```

包含：

- `bside-tracks`：7 个可播放的无版权测试音频。
- `bside-covers`：8 张统一生成的 Artist、Album 和 Playlist 封面。
- `bside-avatars`：1 张默认头像，供以后使用。

测试音频是程序生成的简单音调，不是正式音乐，但文件格式、路径和时长都与数据库 Seed 对应。

## 放到项目里

解压后应得到：

```text
Bside/back/storage-seed/
```

## 导入

先启动 MinIO，然后在 `Bside` 项目根目录运行：

```bash
bash back/storage-seed/seed_minio.sh --reset
```

`--reset` 会让三个 Bucket 与这套文件完全一致，并删除其中不属于这套 Seed 的对象。它只适合本地开发或统一演示环境。

保留已有其他对象，只覆盖 Seed 文件：

```bash
bash back/storage-seed/seed_minio.sh
```

## 验证

```bash
bash back/storage-seed/verify_minio.sh
```

验证成功后会逐个显示：

```text
OK: bside-tracks/audio/midnight-drive.mp3
...
All expected MinIO objects are present.
```

## 环境变量

脚本会自动读取：

```text
Bside/.env
```

支持这些变量：

```text
AWS_PUBLIC_ENDPOINT_URL
AWS_ENDPOINT_URL
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
MINIO_ROOT_USER
MINIO_ROOT_PASSWORD
```

本机地址无法自动识别时，可以明确指定：

```bash
MINIO_SEED_ENDPOINT=http://127.0.0.1:9000 \
  bash back/storage-seed/seed_minio.sh --reset
```

脚本优先使用本机安装的 `mc`。没有 `mc` 时，会自动使用官方 `minio/mc` Docker 镜像。

## Bucket 权限

- `bside-covers`：公开读取，因为数据库保存的是直接访问 MinIO 的 URL。
- `bside-avatars`：公开读取。
- `bside-tracks`：保持私有，由后端生成临时的 presigned URL。

## 和数据库一起初始化

先导入数据库：

```bash
PGPASSWORD="$DB_PASSWORD" psql \
  -h 127.0.0.1 \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 \
  -f back/seeds/full_seed.sql
```

再导入 MinIO：

```bash
bash back/storage-seed/seed_minio.sh --reset
```

这样数据库里的 `audio_url`、`photo_url`、`cover_url` 都会有对应的真实对象。
