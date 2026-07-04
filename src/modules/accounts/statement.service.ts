// ==============================================================
// SecureBank — Statement Service
// Generates PDF and JSON account statements
// ==============================================================

import PDFDocument from 'pdfkit';
import { prisma } from '../../shared/database';
import { encrypt, decrypt, maskIBAN } from '../../shared/security';
import { AppError } from '../../shared/middleware';
import fs from 'fs';
import path from 'path';

export class StatementService {
  /**
   * Generates a statement for a given account and period.
   */
  static async generateStatement(accountId: string, startDate: Date, endDate: Date, format: 'PDF' | 'JSON' = 'PDF') {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: {
        user: true,
      },
    });

    if (!account) {
      throw new AppError('Account not found', 404);
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { senderAccountId: accountId },
          { receiverAccountId: accountId }
        ],
        status: 'COMPLETED',
        createdAt: {
          gte: startDate,
          lte: endDate,
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (format === 'JSON') {
      return this.generateJsonStatement(account, transactions, startDate, endDate);
    } else {
      return this.generatePdfStatement(account, transactions, startDate, endDate);
    }
  }

  private static generateJsonStatement(account: any, transactions: any[], startDate: Date, endDate: Date) {
    const decryptedIban = decrypt(account.iban);
    
    return {
      accountInfo: {
        iban: maskIBAN(decryptedIban), // Only return masked IBAN
        bic: account.bic,
        currency: account.currency,
        type: account.type,
      },
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      transactions: transactions.map(t => ({
        id: t.id,
        date: t.createdAt.toISOString(),
        description: t.description || 'Transaction',
        amount: Number(t.amount),
        currency: t.currency,
        type: t.senderAccountId === account.id ? 'DEBIT' : 'CREDIT',
      }))
    };
  }

  private static async generatePdfStatement(account: any, transactions: any[], startDate: Date, endDate: Date): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const decryptedIban = decrypt(account.iban);
        const fileName = `statement-${account.id}-${Date.now()}.pdf`;
        
        // Use a temp directory for generated statements
        const tmpDir = path.join(process.cwd(), 'tmp', 'statements');
        if (!fs.existsSync(tmpDir)) {
          fs.mkdirSync(tmpDir, { recursive: true });
        }
        
        const filePath = path.join(tmpDir, fileName);
        
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(filePath);
        
        doc.pipe(stream);
        
        // Header
        doc.fontSize(20).text('SecureBank Platform', { align: 'center' });
        doc.moveDown();
        doc.fontSize(16).text('Account Statement', { align: 'center' });
        doc.moveDown();
        
        // Account Info
        doc.fontSize(12).text(`Client: ${account.user.firstName} ${account.user.lastName}`);
        doc.text(`Account Type: ${account.type}`);
        doc.text(`IBAN: ${maskIBAN(decryptedIban)}`);
        doc.text(`BIC: ${account.bic}`);
        doc.text(`Period: ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`);
        doc.moveDown();
        
        // Transactions Table Header
        const tableTop = doc.y;
        doc.font('Helvetica-Bold');
        doc.text('Date', 50, tableTop);
        doc.text('Description', 150, tableTop);
        doc.text('Amount', 400, tableTop, { width: 90, align: 'right' });
        
        doc.moveTo(50, tableTop + 15).lineTo(500, tableTop + 15).stroke();
        
        let y = tableTop + 25;
        doc.font('Helvetica');
        
        // Transaction Rows
        for (const t of transactions) {
          if (y > 700) {
            doc.addPage();
            y = 50;
          }
          
          const type = t.senderAccountId === account.id ? '-' : '+';
          const amountStr = `${type}${Number(t.amount).toFixed(2)} ${t.currency}`;
          
          doc.text(t.createdAt.toLocaleDateString(), 50, y);
          doc.text((t.description || t.type).substring(0, 40), 150, y);
          
          if (type === '-') {
            doc.fillColor('red');
          } else {
            doc.fillColor('green');
          }
          doc.text(amountStr, 400, y, { width: 90, align: 'right' });
          doc.fillColor('black');
          
          y += 20;
        }
        
        doc.end();
        
        stream.on('finish', () => {
          // Ideally, sign the PDF here and upload to blob storage
          resolve(filePath);
        });
        
        stream.on('error', (err) => {
          reject(new AppError('Failed to generate PDF', 500));
        });
        
      } catch (error) {
        reject(error);
      }
    });
  }
}
