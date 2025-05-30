// 工具函数：字符串转Uint8Array
const toUint8Array = (str) => new TextEncoder().encode(str)

// 工具函数：ArrayBuffer转Hex
const toHex = (buffer) => {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
}

// HMAC-SHA256签名
const hmacSha256 = async (key, message) => {
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        {name: 'HMAC', hash: 'SHA-256'},
        false,
        ['sign']
    )
    return await crypto.subtle.sign('HMAC', cryptoKey, message)
}

// SHA256哈希
const sha256 = async (message) => {
    return await crypto.subtle.digest('SHA-256', message)
}

// 生成签名密钥
const getSignatureKey = async (key, dateStamp, regionName, serviceName) => {
    const kSecret = toUint8Array('AWS4' + key)
    const kDate = await hmacSha256(kSecret, toUint8Array(dateStamp))
    const kRegion = await hmacSha256(kDate, toUint8Array(regionName))
    const kService = await hmacSha256(kRegion, toUint8Array(serviceName))
    const kSigning = await hmacSha256(kService, toUint8Array('aws4_request'))
    return kSigning
}

// 获取AWS格式时间戳
const getAmzDate = () => {
    const now = new Date()
    return now.toISOString().replace(/[:\-]|\.\d{3}/g, '')
}

// 编码URI路径（保留正斜杠）
const encodeURIPath = (path) => {
    return path.split('/').map(segment => {
        // 对每个路径段编码，但保留斜杠
        return encodeURIComponent(segment).replace(/%2F/g, '/')
    }).join('/')
}

// 生成规范查询字符串
const getCanonicalQueryString = (queryParams) => {
    return Object.keys(queryParams)
        .sort()
        .map(key => {
            const value = queryParams[key]
            return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
        })
        .join('&')
}

// 生成签名URL（GET请求）
export const generateSignedS3Url = async (options) => {
    const {
        accessKeyId,
        secretAccessKey,
        region = 'us-east-1',
        bucket,
        key,
        expires = 86400, // 默认1天有效期
        endpoint = `s3.${region}.amazonaws.com`
    } = options

    // 1. 准备基本参数
    const method = 'GET'
    const service = 's3'
    const algorithm = 'AWS4-HMAC-SHA256'

    // 2. 准备时间戳
    const now = new Date()
    const amzDate = getAmzDate()
    const dateStamp = amzDate.slice(0, 8) // YYYYMMDD
    const expirationTime = new Date(now.getTime() + expires * 1000)
    const expiry = Math.floor(expirationTime.getTime() / 1000).toString()

    // 3. 准备查询参数
    const queryParams = {
        'X-Amz-Algorithm': algorithm,
        'X-Amz-Credential': `${accessKeyId}/${dateStamp}/${region}/${service}/aws4_request`,
        'X-Amz-Date': amzDate,
        'X-Amz-Expires': expires.toString(),
        'X-Amz-SignedHeaders': 'host'
    }

    // 4. 生成规范请求
    const canonicalUri = encodeURIPath(`/${bucket}/${key}`)
    const canonicalQueryString = getCanonicalQueryString(queryParams)
    const canonicalHeaders = `host:${endpoint}\n`
    const signedHeaders = 'host'
    const payloadHash = 'UNSIGNED-PAYLOAD' // GET请求不需要payload

    const canonicalRequest = [
        method,
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        payloadHash
    ].join('\n')

    // 5. 生成待签字符串
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
    const stringToSign = [
        algorithm,
        amzDate,
        credentialScope,
        toHex(await sha256(toUint8Array(canonicalRequest)))
    ].join('\n')

    // 6. 计算签名
    const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service)
    const signature = toHex(await hmacSha256(signingKey, toUint8Array(stringToSign)))

    // 7. 构建最终URL
    const signedUrl = new URL(`https://${endpoint}${canonicalUri}`)
    signedUrl.searchParams.set('X-Amz-Algorithm', algorithm)
    signedUrl.searchParams.set('X-Amz-Credential', queryParams['X-Amz-Credential'])
    signedUrl.searchParams.set('X-Amz-Date', amzDate)
    signedUrl.searchParams.set('X-Amz-Expires', expires.toString())
    signedUrl.searchParams.set('X-Amz-SignedHeaders', signedHeaders)
    signedUrl.searchParams.set('X-Amz-Signature', signature)

    return signedUrl.toString()
}

export async function onRequest({request,env}) {
    try {

        // 从URL路径获取文件key
        const url = new URL(request.url)
        const key = url.pathname.slice(1) || 'default.txt'
        console.log(env)
        const signedUrl = await generateSignedS3Url({
            accessKeyId: env.accessKeyId,
            secretAccessKey: env.secretAccessKey,
            region: env.region,
            bucket: env.bucket,
            key: key,
            expires: 300,
            endpoint: env.endpoint
        })

        return fetch(signedUrl);

    } catch (error) {
        return new Response(JSON.stringify({
            error: error.message,
            stack: error.stack
        }), {
            status: 500,
            headers: {'Content-Type': 'application/json'}
        })
    }
}

