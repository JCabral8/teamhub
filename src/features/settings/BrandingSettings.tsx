// Team logo and accent colour. A new logo's main colour becomes the Team colour when none is set.
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import { imageUrl, paletteOfUrl, pickImage, prepareImage, removeImage, uploadImage } from '../../lib/images';
import { AccentProvider } from '../../ui/accent';
import { TeamLogo } from '../../ui/Avatar';
import { HEX_COLOR } from '../../ui/color';
import { ColorWheel, Swatches } from '../../ui/ColorWheel';
import { Badge, Button, ButtonRow, Card, ErrorText, Field, Notice } from '../../ui/components';
import { colors, font, space } from '../../ui/theme';
import type { SectionProps } from './types';

const PRESETS = ['#15803D', '#C8102E', '#1F5FD1', '#0B2545', '#F2A900', '#E35205', '#5B2A86', '#00A3E0', '#111111', '#8A1538'];

export function BrandingSettings({ membership, reload }: SectionProps) {
  const team = membership.team;
  const [color, setColor] = useState<string | null>(team.accent_color);
  const [hex, setHex] = useState(team.accent_color ?? '');
  const [logoColors, setLogoColors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const logo = useAction();
  const save = useAction();

  const logoUrl = imageUrl('team-logos', team.logo_path);
  useEffect(() => {
    setLogoColors([]);
    if (logoUrl) void paletteOfUrl(logoUrl).then(setLogoColors);
  }, [logoUrl]);

  const choose = (next: string | null) => {
    setColor(next);
    setHex(next ?? '');
    setMessage(null);
  };

  const onUpload = () =>
    logo.run(async () => {
      setMessage(null);
      const asset = await pickImage({ square: false });
      if (!asset) return;
      const image = await prepareImage(asset, { maxSize: 512, square: false });
      const path = await uploadImage('team-logos', team.id, image);
      const autoColor = !team.accent_color && image.palette[0] ? image.palette[0] : null;
      await api('updateTeamSettings', { teamId: team.id, logoPath: path, ...(autoColor && { accentColor: autoColor }) });
      removeImage('team-logos', team.logo_path);
      setLogoColors(image.palette);
      if (autoColor) {
        choose(autoColor);
        setMessage('Logo saved. We set the Team colour from it; change it below anytime.');
      } else {
        setMessage('Logo saved.');
      }
      await reload();
    });

  const onRemoveLogo = () =>
    logo.run(async () => {
      await api('updateTeamSettings', { teamId: team.id, logoPath: null });
      removeImage('team-logos', team.logo_path);
      setMessage(null);
      await reload();
    });

  const onSave = () =>
    save.run(async () => {
      setMessage(null);
      await api('updateTeamSettings', { teamId: team.id, accentColor: color });
      await reload();
      setMessage(color ? 'Team colour saved.' : 'Team colour reset to TeamHub blue.');
    });

  const onHex = (text: string) => {
    const t = text.trim().toUpperCase();
    setHex(t);
    const full = t.startsWith('#') ? t : `#${t}`;
    if (HEX_COLOR.test(full)) {
      setColor(full);
      setMessage(null);
    }
  };

  return (
    <>
      <Card>
        <Text style={font.heading}>Logo</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <TeamLogo team={{ ...team, accent_color: color }} size={88} />
          <Text style={[font.small, { flex: 1 }]}>
            {team.logo_path ? 'Shown on the Team page and in Team Settings.' : 'PNG with a transparent background works best. Up to 2 MB.'}
          </Text>
        </View>
        <ButtonRow>
          <Button label={team.logo_path ? 'Change Logo' : 'Upload Logo'} icon="image-outline" busy={logo.busy} onPress={() => void onUpload()} style={{ flex: 1 }} />
          {team.logo_path && <Button label="Remove" variant="secondary" disabled={logo.busy} onPress={() => void onRemoveLogo()} style={{ flex: 1 }} />}
        </ButtonRow>
        <ErrorText error={logo.error} />
      </Card>

      {/* The card previews the colour being chosen: its buttons and badge use it. */}
      <AccentProvider color={color}>
        <Card>
          <Text style={font.heading}>Team colour</Text>
          <Text style={font.small}>Used for buttons, highlights and the calendar whenever someone is looking at this Team.</Text>
          <ColorWheel value={color ?? colors.primary} onChange={choose} />
          {logoColors.length > 0 && (
            <View style={{ gap: space.sm }}>
              <Text style={font.label}>From your logo</Text>
              <Swatches options={logoColors} value={color} onPick={choose} />
            </View>
          )}
          <View style={{ gap: space.sm }}>
            <Text style={font.label}>Popular Team colours</Text>
            <Swatches options={PRESETS} value={color} onPick={choose} />
          </View>
          <Field label="Hex code" value={hex} onChangeText={onHex} placeholder="#15803D" autoCapitalize="characters" autoCorrect={false} maxLength={7} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text style={font.small}>Preview:</Text>
            <Badge label="Manager" tone="primary" />
          </View>
          <Button label="Save Colour" busy={save.busy} onPress={() => void onSave()} />
          {color && <Button label="Use TeamHub Blue" variant="ghost" onPress={() => choose(null)} />}
          <ErrorText error={save.error} />
        </Card>
      </AccentProvider>
      {message && <Notice tone="positive" title={message} />}
    </>
  );
}
