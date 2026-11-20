type Member = { id: string; name: string };

/** Keep legacy names selected while still using IDs for new assignments. */
export function memberOptions(members: readonly Member[], current?: string) {
  const matches = current && !members.some(member => member.id === current)
    ? members.filter(member => member.name === current)
    : [];
  const legacy = matches.length === 1 ? matches[0] : undefined;
  return members.map(member => ({
    value: legacy === member ? member.name : member.id,
    label: member.name,
  }));
}
