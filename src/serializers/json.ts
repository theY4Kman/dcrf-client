import {ISerializer} from '../interface';

export
class JSONSerializer implements ISerializer {
  public serialize = JSON.stringify;
  public deserialize = JSON.parse;
}

export default JSONSerializer;
