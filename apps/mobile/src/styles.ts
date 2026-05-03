import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#09111f'
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 42
  },
  hero: {
    backgroundColor: '#10283f',
    borderRadius: 24,
    padding: 22,
    marginBottom: 18
  },
  eyebrow: {
    color: '#ffbf69',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8
  },
  title: {
    color: '#f2f8ff',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 8
  },
  subtitle: {
    color: '#b8cad7',
    fontSize: 15,
    lineHeight: 22
  },
  statRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18
  },
  statCard: {
    flex: 1,
    backgroundColor: '#173550',
    borderRadius: 18,
    padding: 14
  },
  statLabel: {
    color: '#9eb2be',
    fontSize: 12,
    marginBottom: 6
  },
  statValue: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800'
  },
  section: {
    backgroundColor: '#0f1d30',
    borderRadius: 22,
    padding: 18,
    marginBottom: 16
  },
  sectionTitle: {
    color: '#f2f8ff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6
  },
  sectionText: {
    color: '#9eb2be',
    fontSize: 14,
    marginBottom: 14
  },
  button: {
    backgroundColor: '#ffb84d',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10
  },
  buttonSecondary: {
    backgroundColor: '#1d334b'
  },
  buttonText: {
    color: '#1d160c',
    fontWeight: '800'
  },
  buttonTextLight: {
    color: '#eff6fa',
    fontWeight: '700'
  },
  input: {
    backgroundColor: '#12263d',
    color: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10
  },
  card: {
    backgroundColor: '#12263d',
    borderRadius: 18,
    padding: 14,
    marginTop: 10
  },
  cardDanger: {
    borderWidth: 1,
    borderColor: '#ff7b7b'
  },
  cardWarn: {
    borderWidth: 1,
    borderColor: '#ffd166'
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700'
  },
  cardMeta: {
    color: '#9eb2be',
    fontSize: 13,
    marginTop: 4
  },
  status: {
    color: '#ffd166',
    marginTop: 8,
    fontWeight: '700'
  },
  removeText: {
    color: '#ff9f9f',
    fontWeight: '700',
    marginTop: 10
  },
  scannerBox: {
    overflow: 'hidden',
    borderRadius: 18,
    height: 260,
    marginBottom: 12
  },
  scannerHint: {
    color: '#c9d6df',
    textAlign: 'center',
    marginTop: 8
  },
  recipeTitle: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 6
  },
  recipeBody: {
    color: '#bfd0db',
    fontSize: 14,
    lineHeight: 20
  },
  recipeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#2a4a6f',
    color: '#7dd3fc',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden'
  },
  recipeSteps: {
    color: '#d5e4ef',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6
  }
});
