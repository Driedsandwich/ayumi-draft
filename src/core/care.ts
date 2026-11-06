// Conservative lexical check, not a medical judgment. Mixed states need separate periods.
export function careSignals(text: string) {
  const no =
    /(?:受診|通院)(?:していなかった|していない|しなかった|なし|せず)|未受診|病院には行かなかった/.test(
      text,
    );
  const yes =
    /(?:受診|通院)(?:した|していた|している|を続け|中)|初めて受診|初診|入院|診察を受け|病院に通|通っていた|通っています/.test(
      text,
    );
  return { yes, no };
}
