/* eslint-disable ts/no-unsafe-member-access */
/* eslint-disable ts/no-unsafe-assignment */
/* eslint-disable ts/no-unsafe-call */
import type { LocalContext } from '@/context'
import { Buffer } from 'node:buffer'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { delay, retry } from 'es-toolkit'
import { PDFDocument } from 'pdf-lib'
import {
  DEFAULT_IGNORE_COMPLETED,
  DEFAULT_OVERWRITE,
  DEFAULT_TO_PDF,
  DELAY_BETWEEN_REQUESTS_MS,
  MAX_RETRY_ATTEMPTS,
  OUTPUT_BASE_DIR,
} from '@/constants'
import { logger } from '@/logger/logger'

type CommandFlags = {
  outDir?: string
  toPdf?: boolean
  ignoreCompleted?: boolean
  overwrite?: boolean
  fromFile?: string
}

type DocumentResult = {
  documentUrl: string
  documentName: string
  errors: string[]
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default async function (
  this: LocalContext,
  flags: CommandFlags,
  ...documentUrls: string[]
): Promise<void> {
  const outDirFlag = flags.outDir ?? OUTPUT_BASE_DIR
  const toPdfFlag = flags.toPdf || DEFAULT_TO_PDF
  const ignoreCompletedFlag = flags.ignoreCompleted || DEFAULT_IGNORE_COMPLETED
  const overwriteFlag = flags.overwrite || DEFAULT_OVERWRITE
  const fromFileFlag = flags.fromFile

  let bookUrls = documentUrls

  if (fromFileFlag !== undefined) {
    try {
      const fileContent = await readFile(fromFileFlag, 'utf-8')
      const urlsFromFile = fileContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
      bookUrls = [...bookUrls, ...urlsFromFile]
    }
    catch (error) {
      logger.error(
        `Error reading from file ${fromFileFlag}: ${getErrorMessage(error)}`,
      )
      throw error
    }
  }

  if (bookUrls.length === 0) {
    logger.error('No document URLs provided.')
    throw new Error('No document URLs provided.')
  }

  if (!existsSync(outDirFlag)) {
    await mkdir(outDirFlag, { recursive: true })
  }

  const processDocument = async (
    documentUrl: string,
  ): Promise<DocumentResult> => {
    const errors: string[] = []
    let documentName = 'unknown-document'
    let documentOutputPath = outDirFlag
    let pdfPath = `${documentOutputPath}/${documentName}.pdf`

    let images: { url: string, name: string }[] = []
    try {
      let manifest = null

      let manifestUrl = documentUrl

      if (documentUrl.includes('ark:')) {
        const htmlResponse = await retry(async () => {
          const response = await fetch(documentUrl)
          if (!response.ok) {
            await delay(DELAY_BETWEEN_REQUESTS_MS)
            throw new Error(`HTTP ${response.status} ${response.statusText}`)
          }
          return response.text()
        }, MAX_RETRY_ATTEMPTS)

        const dataIiifUrlMatch = htmlResponse.match(/data-iiif-url="([^"]+)"/)
        manifestUrl = dataIiifUrlMatch?.[1] != null
          ? dataIiifUrlMatch[1].replace(/&#x([0-9A-Fa-f]+);/g, (match, hex: string) => {
              return String.fromCharCode(Number.parseInt(hex, 16))
            })
          : ''
      }

      manifest = await retry(async () => {
        const response = await fetch(manifestUrl)
        if (!response.ok) {
          await delay(DELAY_BETWEEN_REQUESTS_MS)
          throw new Error(`HTTP ${response.status} ${response.statusText}`)
        }
        return response.json()
      }, MAX_RETRY_ATTEMPTS)

      logger.info(`Fetched manifest from ${manifestUrl}`)

      const documentId = documentUrl.replace('/manifest', '').split('/').pop()
      // @ts-expect-error - TypeScript is not aware of the structure of the manifest object, so we use 'any' type here.
      documentName = manifest.metadata.find((item: any) => item.label === 'Titre')?.value ?? 'unknown-document'
      documentName = `[${documentId}]_${documentName}`.replace(/\s+/g, '_')
      documentOutputPath = `${outDirFlag}/${documentName}`
      pdfPath = `${documentOutputPath}/${documentName}.pdf`

      await mkdir(documentOutputPath, { recursive: true })

      // Skip if PDF already exists
      if (ignoreCompletedFlag && toPdfFlag && existsSync(pdfPath)) {
        logger.info(`PDF already exists at ${pdfPath}, skipping document.`)
        return {
          documentUrl,
          documentName,
          errors,
        }
      }

      await writeFile(
        `${documentOutputPath}/manifest.json`,
        JSON.stringify(manifest, null, 2),
        'utf-8',
      )

      // @ts-expect-error - TypeScript is not aware of the structure of the manifest object, so we use 'any' type here.
      images = (manifest.sequences[0].canvases ?? []).map(
        (item: any, idx: number) => {
          const imageId = item.images[0]['@id'].split('/').pop()
          const downloadUrl = item.images[0].resource['@id']
            .replace(
              '623,800',
              '982,',
            )

          const name = `[${idx + 1}]_${imageId}.jpeg`

          return { url: downloadUrl, name }
        },
      )
    }
    catch (error) {
      errors.push(`manifest: ${getErrorMessage(error)}`)

      return {
        documentUrl,
        documentName,
        errors,
      }
    }

    const currentFiles = await readdir(documentOutputPath)

    for (const [index, imageData] of images.entries()) {
      const fileExists = currentFiles.includes(imageData.name)
      if (fileExists && !overwriteFlag) {
        logger.info(
          `File ${imageData.name} already exists in ${documentOutputPath}, skipping download.`,
        )

        continue
      }

      logger.info(
        `Downloading image ${index + 1}/${images.length}: ${imageData.url}`,
      )

      try {
        const filename = imageData.name
        const filePath = `${documentOutputPath}/${filename}`

        const response = await retry(async () => {
          const response = await fetch(imageData.url)
          if (!response.ok) {
            await delay(DELAY_BETWEEN_REQUESTS_MS)
            throw new Error(response.statusText)
          }
          return response
        }, MAX_RETRY_ATTEMPTS)

        const arrayBuffer: ArrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        await writeFile(filePath, buffer)
        logger.info(`Saved image to ${filePath}`)
      }
      catch (error) {
        errors.push(`image: ${getErrorMessage(error)}`)
        logger.error(
          // eslint-disable-next-line ts/restrict-template-expressions
          `Error downloading or saving image url ${imageData.url}: ${error}`,
        )

        return {
          documentUrl,
          documentName,
          errors,
        }
      }
    }

    if (toPdfFlag) {
      logger.info('Converting images to PDF...')

      try {
        const pdfDoc = await PDFDocument.create()

        for (const [index, imageData] of images.entries()) {
          logger.info(`Adding image ${index + 1}/${images.length} to PDF`)

          const imageFilePath = `${documentOutputPath}/${imageData.name}`
          const imageBytes = await readFile(imageFilePath)

          let image
          if (imageData.name.toLowerCase().endsWith('.png')) {
            image = await pdfDoc.embedPng(imageBytes)
          }
          else {
            image = await pdfDoc.embedJpg(imageBytes)
          }

          const page = pdfDoc.addPage([image.width, image.height])
          page.drawImage(image, {
            x: 0,
            y: 0,
            width: image.width,
            height: image.height,
          })
        }

        const pdfBytes = await pdfDoc.save()
        const pdfPath = `${documentOutputPath}/${documentName}.pdf`
        await writeFile(pdfPath, pdfBytes)
        logger.info(`PDF saved to ${pdfPath}`)
      }
      catch (error) {
        errors.push(`pdf: ${getErrorMessage(error)}`)

        // eslint-disable-next-line ts/restrict-template-expressions
        logger.error(`Error saving PDF to ${pdfPath}: ${error}`)

        return {
          documentUrl,
          documentName,
          errors,
        }
      }
    }

    return {
      documentUrl,
      documentName,
      errors,
    }
  }

  const results: DocumentResult[] = []
  for (const documentUrl of bookUrls) {
    const result = await processDocument(documentUrl)
    results.push(result)
  }

  const failedDocuments = results.filter(result => result.errors.length > 0)

  const reportPath = `${outDirFlag}/crawl-report.json`
  await mkdir(outDirFlag, { recursive: true })
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalDocuments: results.length,
        failedDocuments: failedDocuments.length,
        documents: results,
      },
      null,
      2,
    ),
    'utf-8',
  )
  logger.info(`Crawl report saved to ${reportPath}`)

  if (failedDocuments.length > 0) {
    for (const failed of failedDocuments) {
      logger.error(
        `Failed ${failed.documentUrl}: ${failed.errors.join(' | ')}`,
      )
    }

    throw new Error(
      `Failed to process ${failedDocuments.length}/${bookUrls.length} documents`,
    )
  }
}
