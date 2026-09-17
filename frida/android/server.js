let CountdownLatch = function (limit, onSuccess) {
    this.limit = limit
    this.count = 0
    this.waitBlock = onSuccess
}
CountdownLatch.prototype.countDown = function () {
    this.count = this.count + 1
    if (this.limit <= this.count) {
        this.waitBlock()
    }
}
CountdownLatch.prototype.onSuccess = function (success) {
    this.waitBlock = success
}

function semaphore(capacity) {
    var semaphore = {
        capacity: capacity || 1,
        current: 0,
        queue: [],
        firstHere: false,

        take: function () {
            if (semaphore.firstHere === false) {
                semaphore.current++;
                semaphore.firstHere = true;
                var isFirst = 1;
            } else {
                var isFirst = 0;
            }
            var item = {n: 1};

            if (typeof arguments[0] == 'function') {
                item.task = arguments[0];
            } else {
                item.n = arguments[0];
            }

            if (arguments.length >= 2) {
                if (typeof arguments[1] == 'function') item.task = arguments[1];
                else item.n = arguments[1];
            }

            var task = item.task;
            item.task = function () {
                task(semaphore.leave);
            };

            if (semaphore.current + item.n - isFirst > semaphore.capacity) {
                if (isFirst === 1) {
                    semaphore.current--;
                    semaphore.firstHere = false;
                }
                return semaphore.queue.push(item);
            }

            semaphore.current += item.n - isFirst;
            item.task(semaphore.leave);
            if (isFirst === 1) semaphore.firstHere = false;
        },

        leave: function (n) {
            n = n || 1;

            semaphore.current -= n;

            if (!semaphore.queue.length) {
                if (semaphore.current < 0) {
                    throw new Error('leave called too many times.');
                }

                return;
            }

            var item = semaphore.queue[0];

            if (item.n + semaphore.current > semaphore.capacity) {
                return;
            }

            semaphore.queue.shift();
            semaphore.current += item.n;

            setTimeout(item.task, 0);
        },

        available: function (n) {
            n = n || 1;
            return (semaphore.current + n <= semaphore.capacity);
        }
    };

    return semaphore;
}


let setupLatch = new CountdownLatch(2)
let integrityTokenProvider
let integrityInitialized = false
let integrityInitializationStarted = false
let integrityInitializationAttempt = 0
let infoInitialized = false
let bootstrapTimer = null
let lastBootstrapError = null

let integrityCounter = 0
let integritySemaphore = semaphore()
let certificateCounter = 0
let infoData

Java.perform(function () {
    const Modifier = Java.use("java.lang.reflect.Modifier")
    const KeyPairGenerator = Java.use('java.security.KeyPairGenerator')
    const KeyStore = Java.use('java.security.KeyStore')
    const KeyStorePrivateKeyEntry = Java.use("java.security.KeyStore$PrivateKeyEntry")
    const Signature = Java.use('java.security.Signature')
    const Base64 = Java.use('java.util.Base64')
    const Date = Java.use('java.util.Date')
    const ByteBuffer = Java.use('java.nio.ByteBuffer')
    const ByteOrder = Java.use("java.nio.ByteOrder")
    const ByteArrayOutputStream = Java.use('java.io.ByteArrayOutputStream')
    const System = Java.use('java.lang.System')
    const Arrays = Java.use('java.util.Arrays')
    const File = Java.use('java.io.File')
    const Files = Java.use('java.nio.file.Files')
    const MessageDigest = Java.use('java.security.MessageDigest')
    const ZipInputStream = Java.use("java.util.zip.ZipInputStream")
    const ActivityThread = Java.use('android.app.ActivityThread')
    const AppGlobals = Java.use('android.app.AppGlobals')
    const OnSuccessListenerType = Java.use("com.google.android.gms.tasks.OnSuccessListener")
    const OnFailureListenerType = Java.use("com.google.android.gms.tasks.OnFailureListener")
    const IntegrityManagerFactory = Java.use("com.google.android.play.core.integrity.IntegrityManagerFactory")
    const PrepareIntegrityTokenRequest = Java.use("com.google.android.play.core.integrity.StandardIntegrityManager$PrepareIntegrityTokenRequest")
    const StandardIntegrityTokenProvider = Java.use("com.google.android.play.core.integrity.StandardIntegrityManager$StandardIntegrityTokenProvider")
    const StandardIntegrityTokenRequest = Java.use("com.google.android.play.core.integrity.StandardIntegrityManager$StandardIntegrityTokenRequest")
    const KeyGenParameterSpecBuilder = Java.use('android.security.keystore.KeyGenParameterSpec$Builder')
    const KeyProperties = Java.use('android.security.keystore.KeyProperties')
    const PackageManager = Java.use("android.content.pm.PackageManager")
    const Math = Java.use("java.lang.Math")
    const JavaString = Java.use("java.lang.String")
    const StandardCharsets = Java.use("java.nio.charset.StandardCharsets")
    const SecretKeyFactory = Java.use("javax.crypto.SecretKeyFactory")
    const PBEKeySpec = Java.use("javax.crypto.spec.PBEKeySpec")
    const Key = Java.use("java.security.Key")
    const Path = Java.use("java.nio.file.Path")

    const projectId = 293955441834
    const appSignature = "3987d043d10aefaf5a8710b3671418fe57e0e19b653c9df82558feb5ffce5d44"
    const secretKeySalt = Base64.getDecoder().decode("PkTwKSZqUfAUyR0rPQ8hYJ0wNsQQ3dW1+3SCnyTXIfEAxxS75FwkDf47wNv/c8pP3p0GXKR6OOQmhyERwx74fw1RYSU10I4r1gyBVDbRJ40pidjM41G1I1oN")
    const personalPackageId = "com.whatsapp"
    const personalServerPort = 1119
    const businessServerPort = 1120

    function getApplicationContext() {
        let application = ActivityThread.currentApplication()
        if (application === null) {
            application = AppGlobals.getInitialApplication()
        }
        if (application === null) {
            const activityThread = ActivityThread.currentActivityThread()
            if (activityThread !== null) {
                application = activityThread.mInitialApplication.value
            }
        }
        if (application === null) {
            throw new Error('WhatsApp application context is not ready')
        }

        const context = application.getApplicationContext()
        return context === null ? application : context
    }

    function createIntegrityTokenProvider(integrityManager, onSuccess, onError) {
        const integrityTokenPrepareRequestBuilder = PrepareIntegrityTokenRequest.builder()
        integrityTokenPrepareRequestBuilder.setCloudProjectNumber(projectId)
        const integrityTokenPrepareRequest = integrityTokenPrepareRequestBuilder.build()
        const integrityTokenPrepareResponse = integrityManager.prepareIntegrityToken(integrityTokenPrepareRequest)
        const onTokenProviderCreatedListenerType = Java.registerClass({
            name: 'IntegrityTokenProviderHandler' + integrityInitializationAttempt, implements: [OnSuccessListenerType], methods: {
                onSuccess: function (result) {
                    onSuccess(Java.cast(result, StandardIntegrityTokenProvider))
                }
            }
        })
        let onTokenProviderFailedListenerType = Java.registerClass({
            name: 'IntegrityTokenProviderErrorHandler' + integrityInitializationAttempt, implements: [OnFailureListenerType], methods: {
                onFailure: function (result) {
                    let javaResult = Java.cast(result, Java.use(result.$className))
                    onError(javaResult.getMessage())
                }
            }
        })
        const onTokenProviderCreatedListener = onTokenProviderCreatedListenerType.$new()
        const onTokenProviderFailureListener = onTokenProviderFailedListenerType.$new()
        integrityTokenPrepareResponse["addOnSuccessListener"].overload('com.google.android.gms.tasks.OnSuccessListener').call(integrityTokenPrepareResponse, onTokenProviderCreatedListener)
        integrityTokenPrepareResponse["addOnFailureListener"].overload('com.google.android.gms.tasks.OnFailureListener').call(integrityTokenPrepareResponse, onTokenProviderFailureListener)
    }

    function calculateIntegrityToken(integrityTokenProvider, authKey, onSuccess, onError) {
        integrityCounter++
        let integrityRequestBuilder = StandardIntegrityTokenRequest.builder()
        integrityRequestBuilder.setRequestHash(authKey)
        let integrityRequest = integrityRequestBuilder.build()
        let integrityTokenResponse = integrityTokenProvider.request(integrityRequest)
        let onIntegrityTokenSuccessListenerType = Java.registerClass({
            name: 'TokenSuccessHandler' + integrityCounter, implements: [OnSuccessListenerType], methods: {
                onSuccess: function (result) {
                    let javaResult = Java.cast(result, Java.use(result.$className))
                    onSuccess(javaResult.token())
                }
            }
        })
        let onIntegrityTokenErrorListenerType = Java.registerClass({
            name: 'TokenFailureHandler' + integrityCounter, implements: [OnFailureListenerType], methods: {
                onFailure: function (result) {
                    let javaResult = Java.cast(result, Java.use(result.$className))
                    onError(javaResult.getMessage())
                }
            }
        })
        let onIntegrityTokenSuccessListener = onIntegrityTokenSuccessListenerType.$new()
        let onIntegrityTokenErrorListener = onIntegrityTokenErrorListenerType.$new()
        integrityTokenResponse["addOnSuccessListener"].overload('com.google.android.gms.tasks.OnSuccessListener').call(integrityTokenResponse, onIntegrityTokenSuccessListener)
        integrityTokenResponse["addOnFailureListener"].overload('com.google.android.gms.tasks.OnFailureListener').call(integrityTokenResponse, onIntegrityTokenErrorListener)
    }

    function initIntegrityComponent() {
        if (integrityInitialized || integrityInitializationStarted) return

        integrityInitializationStarted = true
        integrityInitializationAttempt++
        try {
            const integrityManager = IntegrityManagerFactory.createStandard(getApplicationContext())
            createIntegrityTokenProvider(integrityManager, (result) => {
                if (integrityInitialized) return
                integrityTokenProvider = result
                integrityInitialized = true
                integrityInitializationStarted = false
                console.log("[*] Initialized integrity component")
                setupLatch.countDown()
            }, (error) => {
                integrityInitializationStarted = false
                console.log("[*] Cannot prepare integrity manager; retrying...", error)
                scheduleBootstrap()
            })
        } catch (error) {
            integrityInitializationStarted = false
            throw error
        }
    }

    function sha256(file, length) {
        let inputStream = Files.newInputStream(file, Java.array("java.nio.file.OpenOption", new Array(0)))
        let data = Java.array("byte", new Array(4096).fill(0))
        let digest = MessageDigest.getInstance("SHA-256")
        let total = 0
        let read
        while ((read = inputStream.read(data)) !== -1 && (length === undefined || total < length)) {
            digest.update(data, 0, length === undefined ? read : Math.min(read, length - total));
            total += read
        }
        inputStream.close();
        return digest.digest();
    }

    function sha1(data) {
        let digest = MessageDigest.getInstance("SHA-1")
        digest.update(data, 0, data.length)
        return digest.digest();
    }

    function md5(inputStream) {
        let data = Java.array("byte", new Array(4096).fill(0))
        let digest = MessageDigest.getInstance("MD5")
        let read
        while ((read = inputStream.read(data, 0, data.length)) !== -1) {
            digest.update(data, 0, read);
        }
        return digest.digest();
    }


    function getApkPaths(context) {
        let packageName = context.getPackageName()
        let applicationInfo = context.getPackageManager().getApplicationInfo(packageName, 0)
        let rawPaths = [applicationInfo.sourceDir.value]
        let splitSourceDirs = applicationInfo.splitSourceDirs.value
        if (splitSourceDirs !== null) {
            for (const splitSourceDir of splitSourceDirs) {
                rawPaths.push(splitSourceDir.toString())
            }
        }
        return rawPaths.map((rawPath) => Java.cast(File.$new(rawPath).toPath(), Path))
    }

    function readZipEntry(zipInputStream) {
        let output = ByteArrayOutputStream.$new()
        let data = Java.array("byte", new Array(4096).fill(0))
        let read
        while ((read = zipInputStream.read(data, 0, data.length)) !== -1) {
            output.write(data, 0, read)
        }
        output.close()
        return output.toByteArray()
    }

    function getDataInApks(apkPaths) {
        let classesMd5 = undefined
        let aboutLogo = undefined

        for (const apkPath of apkPaths) {
            let zipInputStream = ZipInputStream.$new(Files.newInputStream(apkPath, Java.array("java.nio.file.OpenOption", new Array(0))))
            try {
                let zipEntry
                while ((zipEntry = zipInputStream.getNextEntry()) !== null) {
                    const entryName = zipEntry.getName().toString()
                    if (classesMd5 === undefined && entryName.endsWith("classes.dex")) {
                        classesMd5 = md5(zipInputStream)
                    } else if (aboutLogo === undefined && entryName.includes("about_logo.png")) {
                        aboutLogo = readZipEntry(zipInputStream)
                    }
                    if (classesMd5 !== undefined && aboutLogo !== undefined) break
                }
            } finally {
                zipInputStream.close()
            }
            if (classesMd5 !== undefined && aboutLogo !== undefined) break
        }

        return [classesMd5, aboutLogo]
    }

    function intInfoComponent() {
        if (infoInitialized) return

        let context = getApplicationContext()
        let packageName = context.getPackageName()

        let packageInfo = context.getPackageManager().getPackageInfo(packageName, 0)
        let packageVersion = packageInfo.versionName.value

        let apkPaths = getApkPaths(context)
        let apkPath = apkPaths[0]
        let apkSha256 = sha256(apkPath)
        let apkShatr = sha256(apkPath, 10 * 1024 * 1024)
        let [classesMd5, aboutLogo] = getDataInApks(apkPaths)
        if (classesMd5 === undefined || aboutLogo === undefined) {
            throw new Error("Incomplete apk data")
        }

        let packageNameBytes = JavaString.$new(packageName).getBytes(StandardCharsets.UTF_8.value)
        let password = Java.array("byte", new Array(packageNameBytes.length + aboutLogo.length).fill(0))
        System.arraycopy(packageNameBytes, 0, password, 0, packageNameBytes.length)
        System.arraycopy(aboutLogo, 0, password, packageNameBytes.length, aboutLogo.length)
        let passwordChars = Java.array("char", new Array(password.length).fill(''))
        for (let i = 0; i < passwordChars.length; i++) {
            passwordChars[i] = String.fromCharCode(password[i] & 0xFF);
        }

        let factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        let key = PBEKeySpec.$new(passwordChars, secretKeySalt, 600000, 512)
        let secretKey = Java.cast(factory.generateSecret(key), Key).getEncoded()

        let signatures = context.getPackageManager().getPackageInfo(packageName, PackageManager.GET_SIGNATURES.value).signatures.value
        if (signatures.length !== 1) {
            throw new Error("Unexpected number of signatures: ", signatures.length)
        }
        let signature = signatures[0].toByteArray()

        infoData = {
            "packageName": packageName,
            "version": packageVersion,
            "apkPath": apkPath.toString(),
            "apkSha256": Base64.getEncoder().encodeToString(apkSha256),
            "apkShatr": Base64.getEncoder().encodeToString(apkShatr),
            "apkSize": Files.size(apkPath),
            "classesMd5": Base64.getEncoder().encodeToString(classesMd5),
            "secretKey": Base64.getEncoder().encodeToString(secretKey),
            "signature": Base64.getEncoder().encodeToString(signature),
            "signatureSha1": Base64.getEncoder().encodeToString(sha1(signature))
        }
        infoInitialized = true
        console.log("[*] Initialized info component")
        setupLatch.countDown()
    }

    function finishResponse(res, body) {
        try {
            Promise.resolve(res.end(body))
                .catch((error) => console.log("[*] HTTP response completion failed", error))
        } catch (error) {
            console.log("[*] HTTP response completion failed", error)
        }
    }

    function onIntegrity(req, res) {
        integritySemaphore.take(() => {
            let authKey = req.authKey
            try {
                let nonce = Base64.getEncoder().withoutPadding().encodeToString(Base64.getUrlDecoder().decode(authKey))
                calculateIntegrityToken(integrityTokenProvider, nonce, (token) => {
                    finishResponse(res, JSON.stringify({
                        "token": token
                    }))
                    setTimeout(() => integritySemaphore.leave(1), 1000)
                }, (error) => {
                    finishResponse(res, JSON.stringify({
                        "error": error.toString() + "\n" + error.stack
                    }))
                    setTimeout(() => integritySemaphore.leave(1), 1000)
                })
            } catch (error) {
                finishResponse(res, JSON.stringify({
                    "error": error.toString() + "\n" + error.stack
                }))
                setTimeout(() => integritySemaphore.leave(1), 1000)
            }
        })
    }

    function onCert(req, res) {
        let authKey = Base64.getDecoder().decode(req.authKey)
        let enc = Base64.getDecoder().decode(req.enc)
        try {
            certificateCounter++
            let alias = "ws_cert_" + certificateCounter

            let ks = KeyStore.getInstance('AndroidKeyStore')
            ks.load(null)
            ks.deleteEntry(alias)

            let expireTime = Date.$new()
            expireTime.setTime(System.currentTimeMillis().valueOf() + 80 * 365 * 24 * 60 * 60 * 1000)

            let attestationChallenge = ByteBuffer.allocate(authKey.length + 9)
            attestationChallenge.order(ByteOrder.BIG_ENDIAN.value)
            attestationChallenge.putLong(System.currentTimeMillis().valueOf() / 1000 - 15)
            attestationChallenge.put(0x1F)
            attestationChallenge.put(authKey)
            let attestationChallengeBytes = Java.array("byte", new Array(attestationChallenge.remaining()).fill(0));
            attestationChallenge.get(attestationChallengeBytes);

            let keyPairGenerator = KeyPairGenerator.getInstance('EC', 'AndroidKeyStore')
            let keySpec = KeyGenParameterSpecBuilder.$new(alias, KeyProperties.PURPOSE_SIGN.value)
                .setDigests(Java.array('java.lang.String', [KeyProperties.DIGEST_SHA256.value, KeyProperties.DIGEST_SHA512.value]))
                .setUserAuthenticationRequired(false)
                .setCertificateNotAfter(expireTime)
                .setAttestationChallenge(attestationChallengeBytes)
                .build()
            keyPairGenerator.initialize(keySpec)
            keyPairGenerator.generateKeyPair()

            let certs = ks.getCertificateChain(alias)
            let ba = ByteArrayOutputStream.$new()
            for (let i = certs.length - 1; i >= 1; i--) {
                let encoded = certs[i].getEncoded()
                ba.write(encoded, 0, encoded.length)
            }

            let c0Hex = toHexString(certs[0].getEncoded())
            let pubHex = toHexString(authKey)
            let timeBytes = ByteBuffer.allocate(8)
                .putLong(System.currentTimeMillis())
                .array()
            let time = toHexString(timeBytes).substring(4)
            let pubIndex = c0Hex.indexOf(pubHex)
            let timeIndex = pubIndex + 64 + 20
            let signIndex = timeIndex + time.length + 80
            let tailIndex = signIndex + appSignature.length
            let newC0Hex = c0Hex.substring(0, timeIndex)
                + time
                + c0Hex.substring(timeIndex + time.length, signIndex)
                + appSignature
                + c0Hex.substring(tailIndex)
            let newC0HexBytes = hexStringToByteArray(newC0Hex)
            ba.write(newC0HexBytes, 0, newC0HexBytes.length)

            let s = Signature.getInstance('SHA256withECDSA')
            let entry = Java.cast(ks.getEntry(alias, null), KeyStorePrivateKeyEntry)
            let privateKey = entry.getPrivateKey()
            s.initSign(privateKey)
            s.update(enc)
            ks.deleteEntry(alias)

            let encSign = Base64.getUrlEncoder().withoutPadding().encodeToString(s.sign())
            let encCert = Base64.getEncoder().encodeToString(ba.toByteArray())
            ba.close()

            finishResponse(res, JSON.stringify({
                "signature": encSign,
                "certificate": encCert
            }))
        } catch (error) {
            finishResponse(res, JSON.stringify({
                "error": error.toString() + "\n" + error.stack
            }))
        }
    }

    function hexStringToByteArray(s) {
        const result = []
        for (let i = 0; i < s.length; i += 2) {
            result.push(parseInt(s.substring(i, i + 2), 16))
        }
        return Java.array('byte', result)
    }

    function toHexString(byteArray) {
        let result = ''
        for (let i = 0; i < byteArray.length; i++) {
            result += ('0' + (byteArray[i] & 0xFF).toString(16)).slice(-2)
        }
        return result
    }


    function onInfo(res) {
        try {
            finishResponse(res, JSON.stringify(infoData))
        } catch (error) {
            finishResponse(res, JSON.stringify({
                "error": error.toString() + "\n" + error.stack
            }))
        }
    }

    function stringToUtf8Buffer(value) {
        const bytes = []
        for (let index = 0; index < value.length; index++) {
            let codePoint = value.charCodeAt(index)
            if (codePoint >= 0xD800 && codePoint <= 0xDBFF && index + 1 < value.length) {
                const low = value.charCodeAt(index + 1)
                if (low >= 0xDC00 && low <= 0xDFFF) {
                    codePoint = 0x10000 + ((codePoint - 0xD800) << 10) + (low - 0xDC00)
                    index++
                }
            }

            if (codePoint <= 0x7F) {
                bytes.push(codePoint)
            } else if (codePoint <= 0x7FF) {
                bytes.push(0xC0 | (codePoint >> 6), 0x80 | (codePoint & 0x3F))
            } else if (codePoint <= 0xFFFF) {
                bytes.push(0xE0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3F), 0x80 | (codePoint & 0x3F))
            } else {
                bytes.push(0xF0 | (codePoint >> 18), 0x80 | ((codePoint >> 12) & 0x3F), 0x80 | ((codePoint >> 6) & 0x3F), 0x80 | (codePoint & 0x3F))
            }
        }
        return new Uint8Array(bytes)
    }

    function asciiFromBuffer(buffer) {
        const bytes = new Uint8Array(buffer)
        let value = ''
        for (let index = 0; index < bytes.length; index++) {
            value += String.fromCharCode(bytes[index])
        }
        return value
    }

    function parseRequestTarget(target) {
        const question = target.indexOf('?')
        const pathname = question === -1 ? target : target.substring(0, question)
        const query = {}
        if (question !== -1) {
            const rawQuery = target.substring(question + 1)
            for (const pair of rawQuery.split('&')) {
                if (pair.length === 0) continue
                const separator = pair.indexOf('=')
                const rawKey = separator === -1 ? pair : pair.substring(0, separator)
                const rawValue = separator === -1 ? '' : pair.substring(separator + 1)
                const key = decodeURIComponent(rawKey.replace(/\+/g, ' '))
                query[key] = decodeURIComponent(rawValue.replace(/\+/g, ' '))
            }
        }
        return {pathname, query}
    }

    function createResponse(connection) {
        let statusCode = 200
        let headers = {"Content-Type": "application/json"}
        let ended = false

        return {
            writeHead(code, extraHeaders) {
                statusCode = code
                headers = Object.assign(headers, extraHeaders || {})
            },
            async end(body) {
                if (ended) return
                ended = true
                const payload = stringToUtf8Buffer(body === undefined ? '' : String(body))
                const reason = statusCode === 200 ? 'OK' : statusCode === 404 ? 'Not Found' : 'Error'
                const responseHeaders = Object.assign({}, headers, {
                    "Content-Length": String(payload.byteLength),
                    "Connection": "close"
                })
                let head = `HTTP/1.1 ${statusCode} ${reason}\r\n`
                for (const [name, value] of Object.entries(responseHeaders)) {
                    head += `${name}: ${value}\r\n`
                }
                head += '\r\n'

                const headBytes = stringToUtf8Buffer(head)
                const response = new Uint8Array(headBytes.byteLength + payload.byteLength)
                response.set(headBytes, 0)
                response.set(payload, headBytes.byteLength)
                try {
                    await connection.output.writeAll(response.buffer)
                    await connection.output.flush()
                } catch (error) {
                    console.log("[*] HTTP response write failed", error)
                } finally {
                    await connection.close()
                }
            }
        }
    }

    async function handleConnection(connection) {
        const response = createResponse(connection)
        try {
            let request = ''
            while (request.length < 65536 && request.indexOf('\r\n\r\n') === -1) {
                const chunk = await connection.input.read(4096)
                if (chunk === null || chunk.byteLength === 0) break
                request += asciiFromBuffer(chunk)
            }

            const requestLine = request.split('\r\n', 1)[0]
            const parts = requestLine.split(' ')
            if (parts.length < 2 || parts[0] !== 'GET') {
                response.writeHead(404, {"Content-Type": "application/json"})
                await response.end(JSON.stringify({"error": "Unsupported request"}))
                return
            }

            const parsedRequest = parseRequestTarget(parts[1])
            switch (parsedRequest.pathname) {
                case "/integrity":
                    response.writeHead(200, {"Content-Type": "application/json"})
                    onIntegrity(parsedRequest.query, response)
                    break
                case "/cert":
                    response.writeHead(200, {"Content-Type": "application/json"})
                    onCert(parsedRequest.query, response)
                    break
                case "/info":
                    response.writeHead(200, {"Content-Type": "application/json"})
                    onInfo(response)
                    break
                default:
                    response.writeHead(404, {"Content-Type": "application/json"})
                    await response.end(JSON.stringify({"error": "Unknown method"}))
                    break
            }
        } catch (error) {
            response.writeHead(500, {"Content-Type": "application/json"})
            await response.end(JSON.stringify({"error": error.toString()}))
        }
    }

    function startHttpServer(serverPort) {
        Socket.listen({family: 'ipv4', host: '127.0.0.1', port: serverPort})
            .then((listener) => {
                console.log("[*] Server ready on port", serverPort)
                const acceptNext = () => {
                    listener.accept()
                        .then((connection) => {
                            handleConnection(connection)
                                .catch((error) => console.log("[*] HTTP connection failed", error))
                            acceptNext()
                        })
                        .catch((error) => console.log("[*] Server accept failed", error))
                }
                acceptNext()
            })
            .catch((error) => console.log("[*] Server listen failed", error))
    }

    console.log("[*] Initializing server components...")
    setupLatch.onSuccess(() => {
        console.log("[*] All server components are ready")
        const serverPort = infoData["packageName"] === personalPackageId ? personalServerPort : businessServerPort
        startHttpServer(serverPort)
    })
    function scheduleBootstrap(error) {
        if (error !== undefined && error !== null) {
            const errorText = error && error.stack ? error.stack : error.toString()
            if (errorText !== lastBootstrapError) {
                console.log("[*] Components not ready; retrying...", errorText)
                lastBootstrapError = errorText
            }
        }
        if (integrityInitialized && infoInitialized) return
        if (bootstrapTimer !== null) return
        bootstrapTimer = setTimeout(() => {
            bootstrapTimer = null
            bootstrapComponents()
        }, 1000)
    }

    function bootstrapComponents() {
        try {
            initIntegrityComponent()
            intInfoComponent()
        } catch (error) {
            scheduleBootstrap(error)
            return
        }
        scheduleBootstrap()
    }

    setTimeout(bootstrapComponents, 0)
})
