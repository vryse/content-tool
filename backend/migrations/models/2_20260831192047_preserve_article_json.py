from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "runs" ADD "article_json" JSONB;"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "runs" DROP COLUMN "article_json";"""


MODELS_STATE = (
    "eJztmutvmzoUwP+ViE+dlDu1abdV91uSpne5yqNK07tpVYUccBJujE2NWRtN/d9n8wgvw6"
    "AKaVH4lpwH2D+Ofc4x/FJMokNkf7yGUF8AbaP83fqlYGBC/iOla7cUYFmhRggYWCDXeBm1"
    "WtiMAo1x+RIgG3KRDm2NGhYzCOZS7CAkhETjhgZehSIHG48OVBlZQbaGlCvuH7jYwDp8hn"
    "bw19qoSwMiPTZcQxf3duUq21qubIjZtWso7rZQNYIcE4fG1patCd5ZG5gJ6QpiSAGD4vKM"
    "OmL4YnT+TIMZeSMNTbwhRnx0uAQOYpHpFmSgESz48dHY7gRX4i5/dc4uvlxcnn++uOQm7k"
    "h2ki8v3vTCuXuOLoHJXHlx9YABz8LFGHKjDlZl7PprQOXwQo8EQD7sJMAAVx7BQFAdQhM8"
    "qwjiFVvzv2edyxxg/3Vn/a/d2Qm3+iAmQ3gkeyE+8VUdTyeoRiiCJzW6BuIs5/A5IxCTfl"
    "URDRfifpDmEJwPvs/FoE3bfkRRcCfj7neXqbn1NaPp5J/APAK6P5r2UnyZGE7xFR46/HmV"
    "S5D6EXhAovtZ55H9UFzd0cQwbPV/mw8mBe/f2+kkY3+UOSdA3mGuvdcNjbVbyLDZQ+0iVc"
    "w/P1KTQSkoEJutqHsV9wLJSNUoFPNXAUsDv+IaZphQDj3umaCt+64fgx/vk7bC56BPMdr6"
    "ayhvnxiOB7fz7vgm9giuuvOB0HRiG0UgPfmceCy7i7S+DedfW+Jv68d0Mkg+qZ3d/Icixg"
    "QcRlRMnlSgRxJOIA3AvIhqY7mJ5E0hEHv1E6C6mtKQDsmyTavMjpmUAAxW7mMRcMUw/Rps"
    "NBr3AUKy8ixQ5VZnCJmqxq3spjxryrNjLM9sxhdWGYg7h7oUZAeA6G4sZSDuHOoJsfPpUw"
    "GI3CoToqtLlmWWw/gOuoHYLrMjJtxeVdS+BdE9V7XEYa/il/I7VoCIzw5rW9WG/Ea6BOE1"
    "IiADosQ3gXEpnN8nyBxKV9O73mjQupkN+sPbod8T7EpPVylEXGAwd5qzQXeU4AptXpS75b"
    "vGy07VsSU5Owet3L2hG+RvR9OgLYnWHiEIApyRxEOvBMkFd6sdyN50Oor1Sr1h8uTkbtwb"
    "8Lz+IQ40vQtASgktc061c3hVKj/8acqhz6eOu+uvSZcfTPvdtvkQUAz1GwqXkPJMCxVZw5"
    "8yaue2/p65au3sKzgEuOcBYVoAb71bU64Rv7Q1wCvoBXM7dqioPDTnBtWeG0QeSNF2LeJS"
    "y5ODSvq1MJqLYgw9mrY3DMf4VlA4JONu9QR63inA87yTiVOoMt/tlCniEm51oXnoWs6iBq"
    "EGk+ydmYkn6nKsJwvHXQI3L76qqIhnDlYkNbAQ51a91MFv+K7r7d/ZVF69VvW2oW4FbQ1L"
    "MQofHYNCE/Jblv4wROrcfBiS3HVlH4ZYCODSvGNODecinAFlBvcpjTrptwfa7+rcs1LYJq"
    "AbnTyVakdkvnXZpw/dk8CfADlAjLJ0XEtcm9Ausl8DyrOcWr6YSzlW9M6kLjVd0yI2LWJ1"
    "LWIXUkNbK5Iu0de08xpFENo0n0XuM9Yrfr3xE1JbevqZvS1HXOpSZRygGxRLowRE37yeAM"
    "9OT4vktNPT7JwmdImcRjCDWJLQsiuyiEvT0mWVYm+aXl5+A6r1Quw="
)
