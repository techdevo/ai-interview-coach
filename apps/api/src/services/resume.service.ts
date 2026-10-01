import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';

export async function extractResumeText(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<string> {
  const extension = filename.toLowerCase().split('.').pop();

  if (mimeType === 'application/pdf' || extension === 'pdf') {
    const result = await pdfParse(buffer);
    return result.text.trim();
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    extension === 'docx'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  throw new Error('Unsupported resume format. Please upload a PDF or DOCX file.');
}
