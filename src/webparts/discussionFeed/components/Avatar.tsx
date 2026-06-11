import * as React from 'react';
import styles from './DiscussionFeed.module.scss';
import { initials } from '../services/utils';

export interface IAvatarProps {
  name: string;
  picUrl?: string;
  small?: boolean;
}

/**
 * Burgundy circular avatar with white initials (KB / AS / SW / NP in the mockup).
 * Falls back to initials when the local userphoto.aspx image is missing.
 */
export class Avatar extends React.Component<IAvatarProps, { failed: boolean }> {
  constructor(props: IAvatarProps) {
    super(props);
    this.state = { failed: !props.picUrl };
  }

  public render(): JSX.Element {
    const cls: string = this.props.small ? `${styles.avatar} ${styles.avatarSm}` : styles.avatar;
    const showImg: boolean = !!this.props.picUrl && !this.state.failed;

    const style: React.CSSProperties = showImg
      ? { backgroundImage: `url('${this.props.picUrl}')` }
      : {};

    return (
      <div className={cls} style={style} title={this.props.name}>
        {showImg
          ? <img
              src={this.props.picUrl}
              style={{ display: 'none' }}
              onError={() => this.setState({ failed: true })}
            />
          : initials(this.props.name)}
      </div>
    );
  }
}
