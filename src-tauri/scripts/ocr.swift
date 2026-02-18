import Foundation
import Vision

// OCR 脚本：使用 macOS Vision 框架识别图片中的文字
// 用法: swift ocr.swift <图片路径>

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: ocr.swift <image_path>\n", stderr)
    exit(1)
}

let imagePath = CommandLine.arguments[1]
let imageURL = URL(fileURLWithPath: imagePath)

guard let image = CGImageSourceCreateWithURL(imageURL as CFURL, nil),
      let cgImage = CGImageSourceCreateImageAtIndex(image, 0, nil) else {
    fputs("Error: Cannot load image at \(imagePath)\n", stderr)
    exit(1)
}

let semaphore = DispatchSemaphore(value: 0)
var recognizedText = ""

let request = VNRecognizeTextRequest { request, error in
    if let error = error {
        fputs("OCR Error: \(error.localizedDescription)\n", stderr)
        semaphore.signal()
        return
    }
    
    guard let observations = request.results as? [VNRecognizedTextObservation] else {
        semaphore.signal()
        return
    }
    
    let texts = observations.compactMap { observation in
        observation.topCandidates(1).first?.string
    }
    
    recognizedText = texts.joined(separator: "\n")
    semaphore.signal()
}

// 支持中英文
request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en"]
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

do {
    try handler.perform([request])
} catch {
    fputs("Error: \(error.localizedDescription)\n", stderr)
    exit(1)
}

semaphore.wait()
print(recognizedText)
