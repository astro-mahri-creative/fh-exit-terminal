const escapeHtml = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatNumber = (n) => Number(n || 0).toLocaleString();

const STATUS_TONE = {
  TRANSCENDED: '#9575cd',
  PRESERVED: '#aac4ff',
  COMPROMISED: '#7ec88b',
  LIBERATED: '#d4a032',
  QUARANTINED: '#c94040',
};

function buildImpactReportEmail({
  alignmentNarrative = '',
  codes = '',
  alignmentScore = 0,
  totalCodesEntered = 0,
  universes = [],
  optIn = false,
} = {}) {
  const scoreSign = alignmentScore > 0 ? '+' : '';
  const scoreColor =
    alignmentScore < 0 ? '#aac4ff' : alignmentScore > 0 ? '#8fcc88' : '#9e9e9e';

  const subject = `Your Exit Terminal Impact Report — Score: ${scoreSign}${alignmentScore}`;

  const universeRows = universes
    .map((u) => {
      const statusColor = STATUS_TONE[u.status] || '#9e9e9e';
      return `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #2a2a2a;color:#f0eeeb;font-family:'Courier New',monospace;font-size:13px;">${escapeHtml(u.name)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #2a2a2a;color:#f0eeeb;text-align:right;font-family:'Courier New',monospace;font-size:13px;">${formatNumber(u.currentCases)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #2a2a2a;color:${statusColor};text-align:center;font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.12em;">${escapeHtml(u.status || '')}</td>
        </tr>`;
    })
    .join('');

  const optInFooter = optIn
    ? `
      <tr>
        <td style="padding:14px 0 0;font-family:'Courier New',monospace;font-size:11px;color:#777;line-height:1.6;">
          You opted in to receive future messages from Future Hooman.<br>
          To unsubscribe, reply to this email with the word UNSUBSCRIBE.
        </td>
      </tr>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#060606;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#060606;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#060606;font-family:'Courier New',monospace;color:#f0eeeb;">
        <!-- Header -->
        <tr>
          <td style="padding:0 0 18px;border-bottom:1px solid #2a2a2a;">
            <h1 style="margin:0;font-size:14px;letter-spacing:0.3em;color:#aac4ff;font-family:'Courier New',monospace;">PHAX TERMINAL REPORT</h1>
            <p style="margin:6px 0 0;font-size:11px;color:#777;letter-spacing:0.15em;font-family:'Courier New',monospace;">FUTURE HOOMAN EXIT TERMINAL</p>
          </td>
        </tr>

        <!-- Alignment narrative -->
        <tr>
          <td style="padding:24px 0 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f0f0f;border:1px solid #2a2a2a;border-radius:4px;">
              <tr>
                <td style="padding:20px;">
                  <p style="margin:0 0 8px;font-size:11px;color:#777;letter-spacing:0.15em;font-family:'Courier New',monospace;">ALIGNMENT NARRATIVE</p>
                  <p style="margin:0;font-size:14px;line-height:1.7;color:#f0eeeb;font-family:'Courier New',monospace;">${escapeHtml(alignmentNarrative)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Stats: codes / score (table row, not flex) -->
        <tr>
          <td style="padding:16px 0 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="50%" valign="top" style="padding-right:8px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f0f0f;border:1px solid #2a2a2a;border-radius:4px;">
                    <tr>
                      <td align="center" style="padding:18px;">
                        <p style="margin:0 0 6px;font-size:10px;color:#777;letter-spacing:0.12em;font-family:'Courier New',monospace;">CODES ENTERED</p>
                        <p style="margin:0;font-size:28px;font-weight:bold;color:#f0eeeb;font-family:'Courier New',monospace;">${formatNumber(totalCodesEntered)}</p>
                      </td>
                    </tr>
                  </table>
                </td>
                <td width="50%" valign="top" style="padding-left:8px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f0f0f;border:1px solid #2a2a2a;border-radius:4px;">
                    <tr>
                      <td align="center" style="padding:18px;">
                        <p style="margin:0 0 6px;font-size:10px;color:#777;letter-spacing:0.12em;font-family:'Courier New',monospace;">ALIGNMENT SCORE</p>
                        <p style="margin:0;font-size:28px;font-weight:bold;color:${scoreColor};font-family:'Courier New',monospace;">${scoreSign}${alignmentScore}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Codes -->
        <tr>
          <td style="padding:16px 0 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f0f0f;border:1px solid #2a2a2a;border-radius:4px;">
              <tr>
                <td style="padding:16px;">
                  <p style="margin:0 0 6px;font-size:10px;color:#777;letter-spacing:0.12em;font-family:'Courier New',monospace;">YOUR CODES</p>
                  <p style="margin:0;font-size:14px;color:#aac4ff;letter-spacing:0.1em;font-family:'Courier New',monospace;word-break:break-all;">${escapeHtml(codes)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Universe table -->
        <tr>
          <td style="padding:16px 0 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f0f0f;border:1px solid #2a2a2a;border-radius:4px;">
              <tr>
                <td style="padding:14px 14px 4px;">
                  <p style="margin:0;font-size:10px;color:#777;letter-spacing:0.12em;font-family:'Courier New',monospace;">DIMENSIONAL NETWORK STATUS</p>
                </td>
              </tr>
              <tr>
                <td style="padding:0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                    <thead>
                      <tr style="border-bottom:1px solid #3d3d3d;">
                        <th align="left" style="padding:8px 14px;font-size:10px;color:#444;letter-spacing:0.1em;font-family:'Courier New',monospace;">UNIVERSE</th>
                        <th align="right" style="padding:8px 14px;font-size:10px;color:#444;letter-spacing:0.1em;font-family:'Courier New',monospace;">CASES</th>
                        <th align="center" style="padding:8px 14px;font-size:10px;color:#444;letter-spacing:0.1em;font-family:'Courier New',monospace;">STATUS</th>
                      </tr>
                    </thead>
                    <tbody>${universeRows}</tbody>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 0 0;border-top:1px solid #2a2a2a;margin-top:24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="padding:18px 0 0;font-family:'Courier New',monospace;font-size:10px;color:#444;letter-spacing:0.1em;">
                  FUTURE HOOMAN &mdash; PHAX DIMENSIONAL NETWORK
                </td>
              </tr>
              ${optInFooter}
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const universeLines = universes
    .map((u) => `  ${u.name} — ${formatNumber(u.currentCases)} cases — ${u.status || ''}`)
    .join('\n');

  const optInTextFooter = optIn
    ? '\nYou opted in to receive future messages from Future Hooman.\nTo unsubscribe, reply to this email with the word UNSUBSCRIBE.\n'
    : '';

  const text = `PHAX TERMINAL REPORT
FUTURE HOOMAN EXIT TERMINAL

ALIGNMENT NARRATIVE
${alignmentNarrative}

CODES ENTERED:    ${formatNumber(totalCodesEntered)}
ALIGNMENT SCORE:  ${scoreSign}${alignmentScore}

YOUR CODES
${codes}

DIMENSIONAL NETWORK STATUS
${universeLines}

—
FUTURE HOOMAN — PHAX DIMENSIONAL NETWORK
${optInTextFooter}`;

  return { subject, html, text };
}

module.exports = buildImpactReportEmail;
